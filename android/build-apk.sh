#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_DIR="$ANDROID_DIR/app/src/main"
BUILD="$ANDROID_DIR/build"
DIST="$ROOT/dist"
OUT_DIR="$ROOT/release"
OUT="$OUT_DIR/SLOVO-android.apk"

ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
AAPT="${AAPT:-/usr/bin/aapt}"
ZIPALIGN="${ZIPALIGN:-/usr/bin/zipalign}"
APKSIGNER="${APKSIGNER:-/usr/bin/apksigner}"
R8_JAR="${R8_JAR:-$ANDROID_DIR/tools/r8.jar}"
KEYSTORE="${KEYSTORE:-$ANDROID_DIR/slovo-debug.keystore}"

if [ ! -f "$ANDROID_JAR" ]; then
  echo "缺少 android.jar：$ANDROID_JAR" >&2
  echo "请安装 android-sdk-platform-23，或设置 ANDROID_JAR。" >&2
  exit 1
fi
if [ ! -f "$DIST/index.html" ]; then
  echo "缺少 dist/index.html，请先运行 npm run build。" >&2
  exit 1
fi
if [ ! -f "$R8_JAR" ]; then
  echo "缺少 R8: $R8_JAR" >&2
  echo "下载：https://dl.google.com/dl/android/maven2/com/android/tools/r8/8.3.37/r8-8.3.37.jar" >&2
  exit 1
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$OUT_DIR"
rm -rf "$APP_DIR/assets/www"
mkdir -p "$APP_DIR/assets/www"
cp -a "$DIST/." "$APP_DIR/assets/www/"
# aapt auto-decompresses *.gz and strips the suffix. Keep the raw gzip bytes
# under .bin so Android's AssetManager returns a valid gzip stream to Tesseract.
for f in "$APP_DIR/assets/www/tessdata/"*.gz; do
  [ -e "$f" ] || continue
  mv "$f" "${f%.gz}.bin"
done

MANIFEST="$APP_DIR/AndroidManifest.xml"
RES="$APP_DIR/res"
ASSETS="$APP_DIR/assets"

echo "[1/6] aapt 生成 R.java"
"$AAPT" package -f -m -J "$BUILD/gen" -M "$MANIFEST" -S "$RES" -I "$ANDROID_JAR"

echo "[2/6] javac 编译 Java"
find "$APP_DIR/java" "$BUILD/gen" -name '*.java' -print > "$BUILD/sources.txt"
javac -encoding UTF-8 -source 8 -target 8 \
  -classpath "$ANDROID_JAR" \
  -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "[3/6] d8 生成 classes.dex"
java -cp "$R8_JAR" com.android.tools.r8.D8 \
  --min-api 23 --lib "$ANDROID_JAR" --output "$BUILD/dex" \
  $(find "$BUILD/classes" -name '*.class' -print)

echo "[4/6] aapt 打包资源与前端 assets"
"$AAPT" package -f -M "$MANIFEST" -S "$RES" -A "$ASSETS" -I "$ANDROID_JAR" \
  -F "$BUILD/unsigned.apk"

echo "[5/6] 写入 dex，并保持 traineddata.gz 原始字节"
python3 - "$BUILD/unsigned.apk" "$BUILD/dex/classes.dex" <<'PY'
import os
import sys
import tempfile
import zipfile

apk, dex = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk, "a", compression=zipfile.ZIP_DEFLATED) as z:
    z.write(dex, "classes.dex")

tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".apk").name
try:
    with zipfile.ZipFile(apk) as zin, zipfile.ZipFile(tmp, "w") as zout:
        for info in zin.infolist():
            data = zin.read(info.filename)
            stored = info.filename.startswith("assets/www/tessdata/") and info.filename.endswith(".gz")
            info.compress_type = zipfile.ZIP_STORED if stored else info.compress_type
            zout.writestr(info, data)
    os.replace(tmp, apk)
finally:
    if os.path.exists(tmp):
        os.unlink(tmp)
PY

echo "[6/6] zipalign + 签名"
"$ZIPALIGN" -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null
fi
"$APKSIGNER" sign --ks "$KEYSTORE" --ks-key-alias androiddebugkey \
  --ks-pass pass:android --key-pass pass:android \
  --out "$OUT" "$BUILD/aligned.apk"
"$APKSIGNER" verify --verbose "$OUT" | head -8

echo "APK: $OUT"
ls -lh "$OUT"
"$AAPT" dump badging "$OUT" | head -6
