import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";

/**
 * يحوّل ملف DOCX إلى TXT باستخدام Mammoth مع الحفاظ على الفقرات والأسطر.
 */
export const convertDocxToTxt = async (inputPath, outputPath) => {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`الملف غير موجود في المسار: ${inputPath}`);
  }

  const result = await mammoth.extractRawText({ path: inputPath });
  fs.writeFileSync(outputPath, result.value, "utf-8");
};

const isMainModule =
  process.argv[1] &&
  process.argv[1].endsWith(
    path.basename(import.meta.url.replace("file://", ""))
  );

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error(
      "طريقة الاستخدام: node server/docx-to-txt.mjs <input.docx> <output.txt>"
    );
    process.exit(1);
  }

  const [inputDocx, outputTxt] = args;
  convertDocxToTxt(path.resolve(inputDocx), path.resolve(outputTxt)).catch(
    (error) => {
      console.error("حدث خطأ أثناء تحويل DOCX:", error);
      process.exit(1);
    }
  );
}
