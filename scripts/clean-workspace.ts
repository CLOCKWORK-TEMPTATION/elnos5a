import { readdir, unlink, writeFile } from "fs/promises";
import { join } from "path";

// فئة مخصصة لتسجيل الأحداث بشكل احترافي لتجنب استخدام console.log الممنوع هندسياً
class Logger {
  static info(message: string): void {
    process.stdout.write(
      `[معلومات] ${new Date().toISOString()} - ${message}\n`
    );
  }

  static error(message: string, error?: unknown): void {
    process.stderr.write(
      `[خطأ] ${new Date().toISOString()} - ${message} - ${error ? String(error) : ""}\n`
    );
  }
}

// فئة لإدارة إعدادات بيئة التنظيف والاستبعاد لضمان فصل الإعدادات عن المنطق البرمجي
class ConfigManager {
  // محتوى ملفات الاستبعاد التي سيتم إنشاؤها لتوجيه وكيل الذكاء الاصطناعي
  static readonly IGNORE_CONTENT: string = `
# المجلدات المستبعدة من الفهرسة
node_modules/
dist/
fonts/

# الملفات المؤقتة والسجلات
*.log
*.timestamp-*.mjs
*.zip

# المستندات الثنائية
*.doc
*.docx
`.trim();

  // أسماء ملفات الاستبعاد الشائعة لوكلاء البرمجة
  static readonly IGNORE_FILES: string[] = [".windsurfignore", ".cursorignore"];

  // الأنماط النصية (Regex) للملفات المؤقتة التي يجب حذفها فعلياً لتنظيف البيئة
  static readonly DELETE_PATTERNS: RegExp[] = [
    /\.timestamp-.*\.mjs$/,
    /^firebase-debug.*\.log$/,
  ];

  // المجلدات التي يجب تخطيها أثناء البحث لضمان سرعة الأداء
  static readonly SKIP_DIRECTORIES: string[] = [
    "node_modules",
    "dist",
    ".git",
    ".agents",
  ];
}

// الفئة المسؤولة عن تنفيذ عمليات التنظيف وإنشاء الملفات بشكل غير متزامن
class WorkspaceCleaner {
  private readonly targetDirectory: string;

  constructor(targetDirectory: string = process.cwd()) {
    this.targetDirectory = targetDirectory;
  }

  // الدالة الرئيسية التي تدير دورة العمل
  public async execute(): Promise<void> {
    Logger.info("بدء عملية تجهيز مساحة العمل للفهرسة...");
    try {
      await Promise.all([
        this.generateIgnoreFiles(),
        this.removeTemporaryFiles(this.targetDirectory),
      ]);
      Logger.info("تم الانتهاء من تجهيز مساحة العمل بنجاح.");
    } catch (error) {
      Logger.error("فشل في تنفيذ عملية التجهيز الشاملة", error);
    }
  }

  // دالة لإنشاء أو تحديث ملفات الاستبعاد الخاصة بوكلاء الذكاء الاصطناعي
  private async generateIgnoreFiles(): Promise<void> {
    for (const fileName of ConfigManager.IGNORE_FILES) {
      const filePath = join(this.targetDirectory, fileName);
      try {
        await writeFile(filePath, ConfigManager.IGNORE_CONTENT, {
          encoding: "utf8",
        });
        Logger.info(`تم إنشاء/تحديث ملف الاستبعاد: ${fileName}`);
      } catch (error) {
        Logger.error(`فشل في إنشاء ملف ${fileName}`, error);
      }
    }
  }

  // دالة للبحث المتكرر وحذف الملفات المؤقتة بناءً على الأنماط المحددة (Recursion)
  private async removeTemporaryFiles(directory: string): Promise<void> {
    try {
      const entries = await readdir(directory, { withFileTypes: true });

      const deletePromises = entries.map(async (entry) => {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory()) {
          // استثناء المجلدات الثقيلة من البحث لتسريع الأداء وتجنب استهلاك الذاكرة
          if (ConfigManager.SKIP_DIRECTORIES.includes(entry.name)) {
            return;
          }
          await this.removeTemporaryFiles(fullPath);
        } else if (entry.isFile()) {
          // التحقق مما إذا كان الملف يطابق أي نمط من أنماط الحذف
          const shouldDelete = ConfigManager.DELETE_PATTERNS.some((pattern) =>
            pattern.test(entry.name)
          );
          if (shouldDelete) {
            try {
              await unlink(fullPath);
              Logger.info(`تم حذف الملف المؤقت: ${entry.name}`);
            } catch (deleteError) {
              Logger.error(`لم يتم حذف الملف: ${fullPath}`, deleteError);
            }
          }
        }
      });

      await Promise.all(deletePromises);
    } catch (error) {
      Logger.error(`خطأ أثناء قراءة المجلد: ${directory}`, error);
    }
  }
}

// نقطة الإطلاق للتنفيذ الفوري
(async () => {
  const cleaner = new WorkspaceCleaner();
  await cleaner.execute();
})();
