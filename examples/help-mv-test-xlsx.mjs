import fs from "node:fs/promises";
import { Workbook } from "@oai/artifact-tool";
const csvText = await fs.readFile("/Users/teerayutht/WorkSpace/movevai-retail/main_file/mv_test.csv", "utf8");
const workbook = await Workbook.fromCSV(csvText, { sheetName: "mv_test" });
console.log((await workbook.help('workbook.worksheets.getItem')).ndjson);
