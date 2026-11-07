package com.slovo.app;

import android.app.Activity;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class MainActivity extends Activity {
    private static final String TAG = "SlovoAndroid";
    private static final int REQUEST_FILE = 1001;
    private static final int REQUEST_SAVE = 1002;
    private static final String HANDWRITING_URL =
            "https://inputtools.google.com/request?ime=handwriting&app=demopage&cs=1&hl=ru&tc=1";

    private WebView webView;
    private LocalServer server;
    private ValueCallback<Uri[]> pendingFileCallback;
    private File cameraFile;
    private Uri cameraUri;
    private volatile String pendingBackup;
    private TextToSpeech tts;
    private volatile boolean ttsReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureWindow();

        try {
            server = new LocalServer(getAssets());
            server.start();
        } catch (IOException error) {
            Log.e(TAG, "Cannot start local server", error);
            showFatal("СЛОВО 无法启动本地资源服务。");
            return;
        }

        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) return;
            TextToSpeech engine = tts;
            if (engine == null) return;
            int result = engine.setLanguage(new Locale("ru", "RU"));
            Voice bestVoice = null;
            try {
                java.util.Set<Voice> voices = engine.getVoices();
                if (voices != null) {
                    for (Voice voice : voices) {
                        Locale locale = voice.getLocale();
                        if (locale == null || !"ru".equals(locale.getLanguage())) continue;
                        if (voice.isNetworkConnectionRequired()) continue;
                        if (bestVoice == null || voice.getQuality() > bestVoice.getQuality()) {
                            bestVoice = voice;
                        }
                    }
                }
            } catch (Exception error) {
                Log.w(TAG, "Cannot inspect local TTS voices", error);
            }
            if (bestVoice != null && engine.setVoice(bestVoice) == TextToSpeech.SUCCESS) {
                result = TextToSpeech.SUCCESS;
                Log.i(TAG, "Local Russian TTS voice: " + bestVoice.getName());
            }
            engine.setSpeechRate(0.92f);
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA
                    && result != TextToSpeech.LANG_NOT_SUPPORTED;
        });

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F4F0E8"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setWebContentsDebuggingEnabled(false);
        webView.addJavascriptInterface(new NativeBridge(), "SlovoNative");

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUserAgentString(settings.getUserAgentString() + " SlovoAndroid/1.0");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "Page loaded: " + url);
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                Log.e(TAG, "WebView error " + errorCode + ": " + description + " (" + failingUrl + ")");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                return openFileChooser(filePathCallback, fileChooserParams);
            }

            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                Log.d(TAG, "Web: " + message.message());
                return true;
            }
        });

        setContentView(webView);
        String startUrl = "http://127.0.0.1:" + server.getPort() + "/";
        Log.i(TAG, "Loading " + startUrl);
        webView.loadUrl(startUrl);
    }

    private void configureWindow() {
        Window window = getWindow();
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.setStatusBarColor(Color.parseColor("#F4F0E8"));
            window.setNavigationBarColor(Color.parseColor("#F4F0E8"));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    private void showFatal(String message) {
        TextView error = new TextView(this);
        error.setText(message);
        error.setTextSize(16f);
        error.setPadding(48, 96, 48, 48);
        error.setBackgroundColor(Color.parseColor("#F4F0E8"));
        setContentView(error);
    }

    private boolean handleUrl(String url) {
        if (url == null) return true;
        if (url.startsWith("http://127.0.0.1:" + server.getPort())) return false;
        if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("mailto:")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception error) {
                Log.w(TAG, "No app for " + url, error);
            }
            return true;
        }
        return true;
    }

    private boolean openFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingFileCallback = callback;

        String[] accept = params == null ? null : params.getAcceptTypes();
        boolean imagesOnly = accept != null && accept.length > 0;
        if (accept != null) {
            for (String type : accept) {
                if (type == null || !type.toLowerCase(Locale.ROOT).startsWith("image/")) {
                    imagesOnly = false;
                    break;
                }
            }
        }

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType(imagesOnly ? "image/*" : "*/*");

        File cameraDir = new File(getCacheDir(), "camera");
        if (!cameraDir.exists()) cameraDir.mkdirs();
        cameraFile = new File(cameraDir,
                "slovo-camera-" + System.currentTimeMillis() + ".jpg");
        cameraUri = Uri.parse("content://" + SlovoFileProvider.AUTHORITY + "/camera/" + cameraFile.getName());
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
        camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        Intent chooser = Intent.createChooser(pick, "选择单词照片或文件");
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        try {
            startActivityForResult(chooser, REQUEST_FILE);
        } catch (Exception error) {
            Log.e(TAG, "File chooser failed", error);
            pendingFileCallback = null;
            Toast.makeText(this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
            return false;
        }
        return true;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_FILE) {
            Uri result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getData() != null) {
                    result = data.getData();
                } else if (cameraFile != null && cameraFile.exists() && cameraFile.length() > 0) {
                    result = cameraUri;
                    try {
                        grantUriPermission(getPackageName(), result, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    } catch (Exception ignored) {
                        // The provider is in the same app; this is a best-effort grant.
                    }
                }
            }
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(result == null ? null : new Uri[]{result});
                pendingFileCallback = null;
            }
            cameraFile = null;
            cameraUri = null;
            return;
        }

        if (requestCode == REQUEST_SAVE) {
            boolean saved = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackup != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out != null) {
                        out.write(pendingBackup.getBytes(StandardCharsets.UTF_8));
                        out.flush();
                        saved = true;
                        Toast.makeText(this, "备份已保存", Toast.LENGTH_SHORT).show();
                    }
                } catch (Exception error) {
                    Log.e(TAG, "Backup save failed", error);
                    Toast.makeText(this, "备份保存失败", Toast.LENGTH_SHORT).show();
                }
            } else {
                Toast.makeText(this, "已取消保存备份", Toast.LENGTH_SHORT).show();
            }
            pendingBackup = null;
            notifyBackupResult(saved);
            return;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        if (tts != null) tts.stop();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        if (server != null) server.stop();
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    public class NativeBridge {
        @android.webkit.JavascriptInterface
        public void saveBackup(String json, String filename) {
            if (json == null || json.isEmpty()) return;
            pendingBackup = json;
            final String safeName = sanitizeFilename(filename);
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, safeName);
                try {
                    startActivityForResult(intent, REQUEST_SAVE);
                } catch (Exception error) {
                    Log.e(TAG, "Cannot open backup document picker", error);
                    pendingBackup = null;
                    notifyBackupResult(false);
                    Toast.makeText(MainActivity.this, "无法打开保存位置", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void setTextZoom(int percent) {
            runOnUiThread(() -> {
                if (webView != null) {
                    webView.getSettings().setTextZoom(Math.max(85, Math.min(140, percent)));
                }
            });
        }

        @android.webkit.JavascriptInterface
        public boolean hasRussianVoice() {
            return ttsReady;
        }

        @android.webkit.JavascriptInterface
        public void speak(String text) {
            if (text == null || text.isEmpty()) return;
            final String value = text;
            runOnUiThread(() -> {
                if (tts != null && ttsReady) {
                    tts.speak(value, TextToSpeech.QUEUE_FLUSH, null, "slovo-word");
                }
            });
        }

        @android.webkit.JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> {
                if (tts != null) tts.stop();
            });
        }
    }

    private void notifyBackupResult(boolean ok) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript(
                        "window.__slovoBackupResult && window.__slovoBackupResult(" + ok + ")", null);
            }
        });
    }

    private static String sanitizeFilename(String filename) {
        String name = filename == null ? "" : filename.trim();
        if (name.isEmpty()) name = "slovo-backup.json";
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        return name;
    }

    private static class LocalServer {
        private final AssetManager assets;
        private ServerSocket socket;
        private volatile int port;
        private volatile boolean running;
        private Thread acceptThread;

        LocalServer(AssetManager assets) {
            this.assets = assets;
        }

        void start() throws IOException {
            socket = new ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"));
            port = socket.getLocalPort();
            running = true;
            acceptThread = new Thread(() -> {
                while (running) {
                    try {
                        Socket connection = socket.accept();
                        Thread worker = new Thread(() -> handle(connection), "slovo-http");
                        worker.setDaemon(true);
                        worker.start();
                    } catch (IOException error) {
                        if (running) Log.e(TAG, "Accept failed", error);
                    }
                }
            }, "slovo-http-accept");
            acceptThread.setDaemon(true);
            acceptThread.start();
        }

        int getPort() {
            return port;
        }

        void stop() {
            running = false;
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                    // Closing is best effort.
                }
                socket = null;
            }
        }

        private void handle(Socket connection) {
            try (Socket socket = connection) {
                socket.setSoTimeout(20000);
                InputStream in = socket.getInputStream();
                String requestLine = readLine(in);
                if (requestLine == null || requestLine.isEmpty()) return;

                String[] parts = requestLine.split(" ");
                if (parts.length < 2) return;
                String method = parts[0].toUpperCase(Locale.ROOT);
                String target = parts[1];

                Map<String, String> headers = new HashMap<>();
                String line;
                while ((line = readLine(in)) != null && !line.isEmpty()) {
                    int split = line.indexOf(':');
                    if (split > 0) {
                        headers.put(line.substring(0, split).trim().toLowerCase(Locale.ROOT),
                                line.substring(split + 1).trim());
                    }
                }

                int contentLength = 0;
                String lengthHeader = headers.get("content-length");
                if (lengthHeader != null) {
                    try {
                        contentLength = Integer.parseInt(lengthHeader);
                    } catch (NumberFormatException ignored) {
                        contentLength = 0;
                    }
                }
                if (contentLength > 1_500_000) {
                    send(socket.getOutputStream(), 413, "text/plain; charset=utf-8",
                            "Payload too large".getBytes(StandardCharsets.UTF_8), false);
                    return;
                }
                byte[] body = new byte[Math.max(0, contentLength)];
                int offset = 0;
                while (offset < contentLength) {
                    int read = in.read(body, offset, contentLength - offset);
                    if (read < 0) break;
                    offset += read;
                }

                String path = target;
                int query = path.indexOf('?');
                if (query >= 0) path = path.substring(0, query);
                path = URLDecoder.decode(path, "UTF-8");

                if (path.equals("/api/handwriting")) {
                    if (!"POST".equals(method)) {
                        send(socket.getOutputStream(), 405, "application/json; charset=utf-8",
                                "{\"error\":\"Method not allowed\"}".getBytes(StandardCharsets.UTF_8), false);
                    } else {
                        proxyHandwriting(socket.getOutputStream(), body);
                    }
                    return;
                }

                if (path.equals("/api/health")) {
                    send(socket.getOutputStream(), 200, "application/json; charset=utf-8",
                            "{\"ok\":true}".getBytes(StandardCharsets.UTF_8), false);
                    return;
                }

                if (path.equals("/")) path = "/index.html";
                if (path.contains("..")) {
                    send(socket.getOutputStream(), 403, "text/plain; charset=utf-8",
                            "Forbidden".getBytes(StandardCharsets.UTF_8), false);
                    return;
                }

                String contentType = mime(path);
                try {
                    sendAsset(socket.getOutputStream(), path, contentType, "HEAD".equals(method),
                            path.endsWith(".html") ? "no-cache" : "public, max-age=86400");
                } catch (FileNotFoundException missing) {
                    int slash = path.lastIndexOf('/');
                    String name = slash >= 0 ? path.substring(slash + 1) : path;
                    if (!name.contains(".")) {
                        sendAsset(socket.getOutputStream(), "/index.html", "text/html; charset=utf-8",
                                "HEAD".equals(method), "no-cache");
                    } else {
                        send(socket.getOutputStream(), 404, "text/plain; charset=utf-8",
                                "Not found".getBytes(StandardCharsets.UTF_8), false);
                    }
                }
            } catch (Exception error) {
                Log.w(TAG, "HTTP request failed", error);
            }
        }


        private InputStream openAsset(String path) throws IOException {
            try {
                return assets.open("www" + path);
            } catch (FileNotFoundException missing) {
                // aapt stores .gz assets decompressed and without the suffix;
                // the build script keeps raw gzip bytes as .traineddata.bin.
                if (path.endsWith(".gz")) {
                    return assets.open("www" + path.substring(0, path.length() - 3) + ".bin");
                }
                throw missing;
            }
        }

        /**
         * Sends a static asset without loading it fully into the Java heap.
         * Uncompressed assets use AssetFileDescriptor and an exact
         * Content-Length; compressed assets fall back to HTTP chunked encoding.
         */
        private void sendAsset(OutputStream out, String path, String type,
                               boolean headOnly, String cache) throws IOException {
            try (AssetFileDescriptor descriptor = assets.openFd("www" + path)) {
                long length = descriptor.getLength();
                if (length >= 0) {
                    String headers = "HTTP/1.1 200 OK\r\n"
                            + "Content-Type: " + type + "\r\n"
                            + "Content-Length: " + length + "\r\n"
                            + "Cache-Control: " + cache + "\r\n"
                            + "X-Content-Type-Options: nosniff\r\n"
                            + "Connection: close\r\n\r\n";
                    out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
                    if (!headOnly) {
                        try (InputStream input = descriptor.createInputStream()) {
                            copy(input, out);
                        }
                    }
                    out.flush();
                    return;
                }
            } catch (FileNotFoundException compressedOrMissing) {
                // Compressed assets cannot be opened as a file descriptor.
            }

            try (InputStream input = openAsset(path)) {
                String headers = "HTTP/1.1 200 OK\r\n"
                        + "Content-Type: " + type + "\r\n"
                        + "Transfer-Encoding: chunked\r\n"
                        + "Cache-Control: " + cache + "\r\n"
                        + "X-Content-Type-Options: nosniff\r\n"
                        + "Connection: close\r\n\r\n";
                out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
                if (headOnly) {
                    out.flush();
                    return;
                }
                byte[] chunk = new byte[65536];
                int read;
                while ((read = input.read(chunk)) != -1) {
                    out.write(Integer.toHexString(read).getBytes(StandardCharsets.ISO_8859_1));
                    out.write("\r\n".getBytes(StandardCharsets.ISO_8859_1));
                    out.write(chunk, 0, read);
                    out.write("\r\n".getBytes(StandardCharsets.ISO_8859_1));
                }
                out.write("0\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
            }
        }

        private static void copy(InputStream input, OutputStream out) throws IOException {
            byte[] buffer = new byte[65536];
            int read;
            while ((read = input.read(buffer)) != -1) out.write(buffer, 0, read);
        }

        private void proxyHandwriting(OutputStream out, byte[] body) throws IOException {
            HttpURLConnection connection = (HttpURLConnection) new URL(HANDWRITING_URL).openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(body.length);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            try (OutputStream upstream = connection.getOutputStream()) {
                upstream.write(body);
                upstream.flush();
            }
            int status = connection.getResponseCode();
            InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            byte[] data = input == null
                    ? "{\"error\":\"Handwriting service unavailable\"}".getBytes(StandardCharsets.UTF_8)
                    : readAll(input);
            if (input != null) input.close();
            send(out, status == 200 ? 200 : 502, "application/json; charset=utf-8", data, false);
        }

        private static String readLine(InputStream in) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            int current;
            boolean any = false;
            while ((current = in.read()) != -1) {
                any = true;
                if (current == '\n') {
                    byte[] bytes = buffer.toByteArray();
                    int length = bytes.length;
                    if (length > 0 && bytes[length - 1] == '\r') length--;
                    return new String(bytes, 0, length, StandardCharsets.ISO_8859_1);
                }
                buffer.write(current);
                if (buffer.size() > 16384) throw new IOException("Header too large");
            }
            return any ? buffer.toString("ISO-8859-1") : null;
        }

        private static byte[] readAll(InputStream in) throws IOException {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int read;
            while ((read = in.read(chunk)) != -1) buffer.write(chunk, 0, read);
            return buffer.toByteArray();
        }

        private static void send(OutputStream out, int status, String type, byte[] data,
                                 boolean headOnly) throws IOException {
            send(out, status, type, data, headOnly, "no-cache");
        }

        private static void send(OutputStream out, int status, String type, byte[] data,
                                 boolean headOnly, String cache) throws IOException {
            String reason;
            switch (status) {
                case 200: reason = "OK"; break;
                case 403: reason = "Forbidden"; break;
                case 404: reason = "Not Found"; break;
                case 405: reason = "Method Not Allowed"; break;
                case 413: reason = "Payload Too Large"; break;
                default: reason = "Error"; break;
            }
            String headers = "HTTP/1.1 " + status + " " + reason + "\r\n"
                    + "Content-Type: " + type + "\r\n"
                    + "Content-Length: " + data.length + "\r\n"
                    + "Cache-Control: " + cache + "\r\n"
                    + "X-Content-Type-Options: nosniff\r\n"
                    + "Connection: close\r\n\r\n";
            out.write(headers.getBytes(StandardCharsets.ISO_8859_1));
            if (!headOnly) out.write(data);
            out.flush();
        }

        private static String mime(String path) {
            String lower = path.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".html")) return "text/html; charset=utf-8";
            if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
            if (lower.endsWith(".css")) return "text/css; charset=utf-8";
            if (lower.endsWith(".json")) return "application/json; charset=utf-8";
            if (lower.endsWith(".webmanifest")) return "application/manifest+json";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".webp")) return "image/webp";
            if (lower.endsWith(".woff2")) return "font/woff2";
            if (lower.endsWith(".wasm")) return "application/wasm";
            if (lower.endsWith(".onnx") || lower.endsWith(".data") || lower.endsWith(".bin")) {
                return "application/octet-stream";
            }
            if (lower.endsWith(".gz")) return "application/gzip";
            return "application/octet-stream";
        }
    }
}
