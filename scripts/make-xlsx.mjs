import * as XLSX from 'xlsx';
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ['ru', 'zh'],
  ['кошка', '猫'],
  ['собака', '狗'],
  ['птица', '鸟'],
]);
XLSX.utils.book_append_sheet(wb, ws, 'Слова');
XLSX.writeFile(wb, '/tmp/imports/words.xlsx');
console.log('xlsx written');
