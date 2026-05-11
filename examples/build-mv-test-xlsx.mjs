import fs from "node:fs/promises";
import { Workbook, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/teerayutht/WorkSpace/movevai-retail/main_file/mv_test.csv";
const outputPath = "/Users/teerayutht/WorkSpace/movevai-retail/main_file/mv_test.xlsx";

const csvText = await fs.readFile(inputPath, "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "mv_test" });
const sheet = workbook.worksheets.getItem("mv_test");

sheet.freezePanes.freezeRows(1);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(outputPath);
