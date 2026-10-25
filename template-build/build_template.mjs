import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("../dist/assets/", import.meta.url);
const previewDir = new URL("./preview/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const wb = Workbook.create();
const font = "Arial";
const green = "#21694F";
const lightGreen = "#EEF6EF";
const lime = "#D7EDAB";
const ink = "#243A34";
const muted = "#6F7E77";
const amber = "#FFF4D6";
const line = "#DCE6E0";

function baseSheet(name, title, note, headers, widths) {
  const ws = wb.worksheets.add(name);
  ws.showGridLines = false;
  ws.freezePanes.freezeRows(3);
  ws.getRangeByIndexes(0, 0, 203, headers.length).format.font = { name: font, size: 10, color: ink };
  ws.getRange("A1").values = [[title]];
  ws.getRangeByIndexes(0, 0, 1, headers.length).format = {
    fill: lightGreen,
    font: { name: font, size: 14, bold: true, color: green },
    rowHeight: 28,
    verticalAlignment: "center",
  };
  ws.getRange("A2").values = [[note]];
  ws.getRangeByIndexes(1, 0, 1, headers.length).format = {
    fill: amber,
    font: { name: font, size: 9, italic: true, color: muted },
    rowHeight: 32,
    wrapText: false,
  };
  ws.getRangeByIndexes(2, 0, 1, headers.length).values = [headers];
  ws.getRangeByIndexes(2, 0, 1, headers.length).format = {
    fill: green,
    font: { name: font, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    rowHeight: 25,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
  ws.getRangeByIndexes(3, 0, 200, headers.length).format = {
    fill: "#FFFFFF",
    verticalAlignment: "center",
    rowHeight: 21,
    borders: { insideHorizontal: { style: "thin", color: line } },
  };
  widths.forEach((w, i) => ws.getRangeByIndexes(0, i, 203, 1).format.columnWidth = w);
  return ws;
}

const guide = wb.worksheets.add("使用说明");
guide.showGridLines = false;
guide.tabColor = green;
guide.getRange("A1:F25").format.font = { name: font, size: 10, color: ink };
guide.getRange("A2").values = [["微光 Lumi · Excel 导入模板"]];
guide.getRange("A2:F2").format = { font: { name: font, size: 16, bold: true, color: green }, rowHeight: 30 };
guide.getRange("A3").values = [["选择一种导入方式填写，不要同时填写 Quick_成绩 和完整资料页。上传后系统会先预览、检查，再由你确认导入。"]];
guide.mergeCells("A3:F3");
guide.getRange("A3:F3").format = { fill: lightGreen, font: { name: font, size: 10, color: muted }, rowHeight: 42, wrapText: true, verticalAlignment: "center" };
guide.getRange("A5:B5").values = [["方式", "适合情况"]];
guide.getRange("A6:B7").values = [
  ["Quick_成绩", "班级和学生已经在系统中；一次导入一份或多份功课／考试成绩。"],
  ["完整资料页", "第一次搬迁旧资料；依次填写 Students、Classes、Enrollments、Records、Results、Goals。"],
];
guide.getRange("A9:B9").values = [["重要规则", "说明"]];
guide.getRange("A10:B17").values = [
  ["student_code", "学生稳定编号，必须唯一。姓名可以修改，但编号不要更换。"],
  ["class_code", "班级稳定编号，必须唯一，例如 C2027-F3-MATH。"],
  ["record_code", "每份功课／考试的唯一编号，例如 HW-2027-001。"],
  ["空白分数", "表示没有分数，不会当成 0 分。真实 0 分请填写数字 0。"],
  ["日期", "使用真实 Excel 日期；显示格式为 yyyy-mm-dd。"],
  ["状态", "请使用表内下拉选项；考试缺席使用 Absent。"],
  ["隐私", "不要填写电话、家庭资料或其他不需要保存的私人信息。"],
  ["确认", "上传不会立即写入；先修正错误并确认后才导入。"],
];
guide.getRange("A19:B19").values = [["允许值", "内容"]];
guide.getRange("A20:B24").values = [
  ["record_kind", "Homework / Tuition Exam / School Exam / Quiz"],
  ["Homework status", "Submitted / Missing / Late / Makeup / Unrecorded"],
  ["Exam status", "Recorded / Absent / Unrecorded"],
  ["Goal status", "In Progress / Achieved / Paused"],
  ["active", "TRUE / FALSE"],
];
for (const range of ["A5:B5", "A9:B9", "A19:B19"]) guide.getRange(range).format = { fill: green, font: { name: font, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
guide.getRange("A5:B24").format.borders = { preset: "inside", style: "thin", color: line };
guide.getRange("A:B").format.columnWidth = 28;
guide.getRange("B:B").format.columnWidth = 74;
guide.getRange("A3:F24").format.wrapText = true;

const quickHeaders = ["class_code", "record_code", "record_kind", "record_type", "title", "date", "maximum_score", "student_code", "student_name", "status", "score", "note"];
const quick = baseSheet("Quick_成绩", "日常快速导入 / Quick score import", "适合已有班级和学生。相同 record_code 的标题、日期、满分必须一致。填写完成后直接上传此文件。", quickHeaders, [18,18,18,18,26,14,16,18,22,16,12,30]);
quick.tabColor = "#6D9A78";
quick.getRange("F4:F203").setNumberFormat("yyyy-mm-dd");
quick.getRange("G4:G203").setNumberFormat("0.00");
quick.getRange("K4:K203").setNumberFormat("0.00");
quick.getRange("C4:C203").dataValidation = { rule: { type: "list", values: ["Homework", "Tuition Exam", "School Exam", "Quiz"] } };
quick.getRange("J4:J203").dataValidation = { rule: { type: "list", values: ["Submitted", "Missing", "Late", "Makeup", "Unrecorded", "Recorded", "Absent"] } };

const students = baseSheet("Students", "学生 / Students", "每位学生一行。student_code 必须唯一；姓名可以以后修改。", ["student_code","chinese_name","english_name","tag","active"], [18,22,22,18,12]);
students.getRange("E4:E203").dataValidation = { rule: { type: "list", values: ["TRUE","FALSE"] } };

const classes = baseSheet("Classes", "班级 / Classes", "班级按科目和年级建立。class_code 必须唯一；year 使用四位年份。", ["class_code","class_name","english_name","subject","grade","year","active"], [20,24,24,20,16,12,12]);
classes.getRange("F4:F203").setNumberFormat("0");
classes.getRange("G4:G203").dataValidation = { rule: { type: "list", values: ["TRUE","FALSE"] } };

const enroll = baseSheet("Enrollments", "入班关系 / Enrollments", "一个学生可以出现在多个班。退班后旧记录仍留在原班。", ["class_code","student_code","status"], [22,22,18]);
enroll.getRange("C4:C203").dataValidation = { rule: { type: "list", values: ["Active","Left"] } };

const records = baseSheet("Records", "功课与考试 / Records", "每份功课或考试一行。record_code 必须唯一；Homework 可填写 topic。", ["record_code","class_code","record_kind","record_type","title","date","maximum_score","topic","materials_note"], [20,20,18,18,28,14,16,20,34]);
records.getRange("F4:F203").setNumberFormat("yyyy-mm-dd");
records.getRange("G4:G203").setNumberFormat("0.00");
records.getRange("C4:C203").dataValidation = { rule: { type: "list", values: ["Homework","Tuition Exam","School Exam","Quiz"] } };

const results = baseSheet("Results", "学生结果 / Results", "每位学生在每份记录中一行。空白分数不是 0；状态必须符合功课或考试类型。", ["record_code","student_code","status","score","note"], [22,22,18,14,36]);
results.getRange("D4:D203").setNumberFormat("0.00");
results.getRange("C4:C203").dataValidation = { rule: { type: "list", values: ["Submitted", "Missing", "Late", "Makeup", "Unrecorded", "Recorded", "Absent"] } };

const goals = baseSheet("Goals", "考试目标 / Goals", "目标由老师和学生共同设定，进度由老师手动更新。", ["goal_code","class_code","student_code","goal_title","exam_source","target_percentage","status","action_note"], [18,20,20,28,18,18,18,36]);
goals.getRange("E4:E203").dataValidation = { rule: { type: "list", values: ["Tuition Exam","School Exam"] } };
goals.getRange("F4:F203").setNumberFormat("0.00");
goals.getRange("G4:G203").dataValidation = { rule: { type: "list", values: ["In Progress","Achieved","Paused"] } };

for (const ws of [students, classes, enroll, records, results, goals]) ws.tabColor = "#A8C792";

wb.recalculate();
const inspect = await wb.inspect({ kind: "sheet,table", maxChars: 5000, tableMaxRows: 5, tableMaxCols: 12 });
console.log(inspect.ndjson);
const errorScan = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 100 }, summary: "template formula errors" });
console.log(errorScan.ndjson);
const previewSpecs = [
  ["使用说明", "A1:F25", "guide"], ["Quick_成绩", "A1:L10", "quick"], ["Students", "A1:E10", "students"],
  ["Classes", "A1:G10", "classes"], ["Enrollments", "A1:C10", "enrollments"], ["Records", "A1:I10", "records"],
  ["Results", "A1:E10", "results"], ["Goals", "A1:H10", "goals"],
];
for (const [sheetName, range, fileName] of previewSpecs) {
  const preview = await wb.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(new URL(`${fileName}.png`, previewDir), new Uint8Array(await preview.arrayBuffer()));
}
const out = await SpreadsheetFile.exportXlsx(wb);
const outputPath = fileURLToPath(new URL("studylog-excel-import-template.xlsx", outputDir));
await out.save(outputPath);
await fs.rm(`${outputPath}.inspect.ndjson`, { force: true });
