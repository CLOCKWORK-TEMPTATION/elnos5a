# أمثلة عملية لمراجعة API

## مثال 1: مراجعة User Registration Endpoint

### الكود الأصلي (يحتاج تحسين)

```typescript
// ❌ كود يحتاج تحسين
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  const user = await db.users.create({
    email,
    password,
    name
  });
  
  res.json(user);
});
```

### المشاكل المكتشفة

#### 🔴 مشاكل حرجة
1. **لا يوجد validation للمدخلات**
   - يمكن إرسال أي بيانات
   - لا يوجد تحقق من صيغة البريد الإلكتروني
   - لا يوجد تحقق من قوة كلمة المرور

2. **كلمة المرور غير مشفرة**
   - يتم حفظ كلمة المرور كنص واضح في قاعدة البيانات
   - ثغرة أمنية خطيرة جداً

3. **لا يوجد error handling**
   - إذا فشلت العملية، سيحدث crash
   - لا يوجد معالجة للأخطاء

4. **إرجاع بيانات حساسة**
   - يتم إرجاع كلمة المرور في الاستجابة
   - ثغرة أمنية

#### 🟡 مشاكل مهمة
1. **Business logic في route**
   - يجب نقل المنطق إلى service layer

2. **لا يوجد تحقق من المستخدم الموجود**
   - يمكن إنشاء حسابات متعددة بنفس البريد

3. **Database query مباشر**
   - يجب استخدام repository pattern

### الكود المحسّن

```typescript
// ✅ الحل المثالي

// 1. Schema للـ validation
// schemas/auth.schema.ts
import { z } from 'zod';

export const registerSchema = z.object({
  body: z.object({
    name: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name too long'),
    
    email: z.string()
      .email('Invalid email format')
      .toLowerCase()
      .trim(),
    
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain uppercase letter')
      .regex(/[a-z]/, 'Must contain lowercase letter')
      .regex(/[0-9]/, 'Must contain number')
      .regex(/[^A-Za-z0-9]/, 'Must contain special character')
  })
});

// 2. Route نظيف
// routes/auth.routes.ts
import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validation';
import { registerSchema } from '../schemas/auth.schema';

const router = Router();

router.post(
  '/register',
  validateRequest(registerSchema),
  authController.register
);

export default router;

// 3. Controller ينسق فقط
// controllers/auth.controller.ts
import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const userData = req.validatedBody;
      const result = await authService.register(userData);
      
      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();

// 4. Service يحتوي business logic
// services/auth.service.ts
import { UserRepository } from '../repositories/user.repository';
import { EmailService } from './email.service';
import { hashPassword, sanitizeUser } from '../utils/user.utils';
import { generateToken } from '../utils/jwt.utils';
import { AppError } from '../utils/errors';

export class AuthService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService
  ) {}

  async register(userData: { name: string; email: string; password: string }) {
    // التحقق من عدم وجود المستخدم
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    // تشفير كلمة المرور
    const hashedPassword = await hashPassword(userData.password);

    // إنشاء المستخدم
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword
    });

    // إرسال بريد ترحيبي
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    // توليد token
    const token = generateToken({ userId: user.id, email: user.email });

    // إرجاع بيانات آمنة
    return {
      user: sanitizeUser(user),
      token
    };
  }
}

export const authService = new AuthService(
  new UserRepository(),
  new EmailService()
);
```

---

## مثال 2: مراجعة Product Search Endpoint

### الكود الأصلي (يحتاج تحسين)

```typescript
// ❌ كود يحتاج تحسين
router.get('/products/search', async (req, res) => {
  const { query } = req.query;
  
  const products = await db.products.find({
    name: { $regex: query, $options: 'i' }
  });
  
  res.json(products);
});
```

### المشاكل المكتشفة

#### 🔴 مشاكل حرجة
1. **NoSQL Injection vulnerability**
   - المدخل `query` يُستخدم مباشرة في regex
   - يمكن استغلاله لهجمات injection

2. **لا يوجد rate limiting**
   - يمكن إرسال آلاف الطلبات
   - عرضة لهجمات DoS

#### 🟡 مشاكل مهمة
1. **لا يوجد pagination**
   - قد يُرجع آلاف المنتجات دفعة واحدة
   - مشكلة أداء كبيرة

2. **لا يوجد validation**
   - لا يوجد تحقق من طول query
   - لا يوجد حد أدنى للبحث

3. **لا يوجد caching**
   - نفس البحث يُنفذ كل مرة
   - هدر للموارد

#### 🟢 تحسينات مقترحة
1. **إضافة filters إضافية** (category, price range)
2. **إضافة sorting options**
3. **إضافة search suggestions**

### الكود المحسّن

```typescript
// ✅ الحل المثالي

// 1. Schema للـ validation
// schemas/product.schema.ts
import { z } from 'zod';

export const searchProductsSchema = z.object({
  query: z.object({
    q: z.string()
      .min(2, 'Search query must be at least 2 characters')
      .max(100, 'Search query too long')
      .trim(),
    
    category: z.string().optional(),
    
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    
    sortBy: z.enum(['name', 'price', 'createdAt']).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc')
  }).refine(
    data => !data.minPrice || !data.maxPrice || data.minPrice <= data.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice' }
  )
});

// 2. Route مع rate limiting
// routes/product.routes.ts
import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { validateRequest } from '../middleware/validation';
import { searchProductsSchema } from '../schemas/product.schema';
import rateLimit from 'express-rate-limit';

const router = Router();

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // دقيقة واحدة
  max: 30, // 30 طلب بحث كحد أقصى
  message: 'Too many search requests, please try again later'
});

router.get(
  '/products/search',
  searchLimiter,
  validateRequest(searchProductsSchema),
  productController.searchProducts
);

export default router;

// 3. Controller
// controllers/product.controller.ts
import { Request, Response, NextFunction } from 'express';
import { productService } from '../services/product.service';

export class ProductController {
  async searchProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const searchParams = req.validatedQuery;
      const result = await productService.searchProducts(searchParams);
      
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
}

export const productController = new ProductController();

// 4. Service مع caching
// services/product.service.ts
import { ProductRepository } from '../repositories/product.repository';
import { CacheService } from './cache.service';
import { paginate } from '../utils/pagination';
import { escapeRegex } from '../utils/string.utils';

export class ProductService {
  constructor(
    private productRepository: ProductRepository,
    private cacheService: CacheService
  ) {}

  async searchProducts(params: any) {
    // إنشاء cache key
    const cacheKey = `products:search:${JSON.stringify(params)}`;
    
    // محاولة الحصول من cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // تنظيف وتأمين query
    const sanitizedQuery = escapeRegex(params.q);

    // بناء filters
    const filters: any = {
      name: { $regex: sanitizedQuery, $options: 'i' }
    };

    if (params.category) {
      filters.category = params.category;
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      filters.price = {};
      if (params.minPrice !== undefined) {
        filters.price.$gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        filters.price.$lte = params.maxPrice;
      }
    }

    // حساب pagination
    const skip = (params.page - 1) * params.limit;

    // البحث في قاعدة البيانات
    const [products, total] = await Promise.all([
      this.productRepository.search(filters, {
        skip,
        limit: params.limit,
        sort: { [params.sortBy]: params.sortOrder === 'asc' ? 1 : -1 }
      }),
      this.productRepository.count(filters)
    ]);

    // تنسيق النتيجة
    const result = paginate(products, total, {
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder
    });

    // حفظ في cache لمدة 5 دقائق
    await this.cacheService.set(cacheKey, result, 300);

    return result;
  }
}

export const productService = new ProductService(
  new ProductRepository(),
  new CacheService()
);

// 5. Utility لتأمين regex
// utils/string.utils.ts
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
```

---

## مثال 3: مراجعة File Upload Endpoint

### الكود الأصلي (يحتاج تحسين)

```typescript
// ❌ كود يحتاج تحسين
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  res.json({ url: `/uploads/${file.filename}` });
});
```

### المشاكل المكتشفة

#### 🔴 مشاكل حرجة
1. **لا يوجد validation لنوع الملف**
   - يمكن رفع أي نوع ملف (exe, php, etc.)
   - ثغرة أمنية خطيرة

2. **لا يوجد تحديد لحجم الملف**
   - يمكن رفع ملفات ضخمة
   - عرضة لهجمات DoS

3. **لا يوجد error handling**
   - ماذا لو لم يُرفع ملف؟
   - ماذا لو فشل الحفظ؟

4. **لا يوجد authentication**
   - أي شخص يمكنه رفع ملفات

#### 🟡 مشاكل مهمة
1. **اسم الملف غير آمن**
   - يمكن أن يحتوي على أحرف خطرة
   - يجب sanitization

2. **لا يوجد virus scanning**
   - الملفات المرفوعة قد تكون ضارة

3. **لا يوجد تسجيل في قاعدة البيانات**
   - لا يمكن تتبع من رفع ماذا

### الكود المحسّن

```typescript
// ✅ الحل المثالي

// 1. Multer configuration
// config/multer.config.ts
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../utils/errors';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf'
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(new AppError('Invalid file type', 400), false);
  } else {
    cb(null, true);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  }
});

// 2. Route مع authentication
// routes/upload.routes.ts
import { Router } from 'express';
import { uploadController } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth';
import { upload } from '../config/multer.config';

const router = Router();

router.post(
  '/upload',
  authenticate,
  upload.single('file'),
  uploadController.uploadFile
);

export default router;

// 3. Controller
// controllers/upload.controller.ts
import { Request, Response, NextFunction } from 'express';
import { uploadService } from '../services/upload.service';
import { AppError } from '../utils/errors';

export class UploadController {
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const result = await uploadService.processUpload(
        req.file,
        req.user!.id
      );

      res.status(201).json({
        success: true,
        data: result,
        message: 'File uploaded successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const uploadController = new UploadController();

// 4. Service
// services/upload.service.ts
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { FileRepository } from '../repositories/file.repository';
import { AppError } from '../utils/errors';

export class UploadService {
  constructor(private fileRepository: FileRepository) {}

  async processUpload(file: Express.Multer.File, userId: string) {
    try {
      // إذا كانت صورة، قم بتحسينها
      if (file.mimetype.startsWith('image/')) {
        await this.optimizeImage(file.path);
      }

      // حساب hash للملف
      const fileHash = await this.calculateFileHash(file.path);

      // التحقق من عدم وجود نفس الملف
      const existingFile = await this.fileRepository.findByHash(fileHash);
      if (existingFile) {
        // حذف الملف المكرر
        await fs.unlink(file.path);
        return existingFile;
      }

      // حفظ معلومات الملف في قاعدة البيانات
      const fileRecord = await this.fileRepository.create({
        originalName: file.originalname,
        filename: file.filename,
        mimetype: file.mimetype,
        size: file.size,
        hash: fileHash,
        uploadedBy: userId,
        path: file.path
      });

      return {
        id: fileRecord.id,
        url: `/uploads/${file.filename}`,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      };
    } catch (error) {
      // في حالة الخطأ، احذف الملف
      await fs.unlink(file.path).catch(() => {});
      throw error;
    }
  }

  private async optimizeImage(filePath: string): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      await sharp(filePath)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(filePath + '.optimized');
      
      await fs.rename(filePath + '.optimized', filePath);
    }
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    const crypto = await import('crypto');
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }
}

export const uploadService = new UploadService(new FileRepository());
```

---

## مثال 4: تقرير مراجعة كامل

```markdown
# مراجعة API: User Management Module

## ملخص تنفيذي
تمت مراجعة 8 endpoints في User Management Module. تم اكتشاف 3 مشاكل حرجة و5 مشاكل مهمة و7 تحسينات مقترحة.

**الحالة العامة**: 🟡 يحتاج تحسين قبل الإنتاج

## 🔴 مشاكل حرجة (يجب إصلاحها فوراً)

### 1. كلمات المرور غير مشفرة
- **الموقع**: `controllers/auth.controller.ts:45`
- **الوصف**: يتم حفظ كلمات المرور كنص واضح في قاعدة البيانات
- **الخطورة**: ثغرة أمنية خطيرة جداً - في حالة اختراق قاعدة البيانات، جميع كلمات المرور مكشوفة
- **الحل المقترح**:
  ```typescript
  import bcrypt from 'bcrypt';
  const hashedPassword = await bcrypt.hash(password, 10);
  ```

### 2. SQL Injection في endpoint البحث
- **الموقع**: `controllers/user.controller.ts:78`
- **الوصف**: يتم استخدام المدخل مباشرة في SQL query
- **الخطورة**: يمكن للمهاجم تنفيذ أوامر SQL عشوائية
- **الحل المقترح**: استخدام parameterized queries أو ORM

### 3. لا يوجد rate limiting على login endpoint
- **الموقع**: `routes/auth.routes.ts:12`
- **الوصف**: يمكن إرسال آلاف محاولات تسجيل الدخول
- **الخطورة**: عرضة لهجمات brute force
- **الحل المقترح**: إضافة express-rate-limit

## 🟡 مشاكل مهمة (يجب إصلاحها قريباً)

### 1. Business logic في controllers
- **الموقع**: `controllers/user.controller.ts` (متعدد)
- **الوصف**: Controllers تحتوي على business logic معقد
- **التأثير**: صعوبة الصيانة والاختبار
- **الحل المقترح**: نقل المنطق إلى service layer

### 2. لا يوجد pagination في قائمة المستخدمين
- **الموقع**: `controllers/user.controller.ts:120`
- **الوصف**: يتم إرجاع جميع المستخدمين دفعة واحدة
- **التأثير**: مشكلة أداء عند وجود آلاف المستخدمين
- **الحل المقترح**: إضافة pagination

## 🟢 تحسينات مقترحة

### 1. إضافة caching للبيانات المتكررة
- **الموقع**: `services/user.service.ts`
- **الوصف**: بيانات المستخدم تُطلب بشكل متكرر
- **الفائدة**: تحسين الأداء بنسبة 40-60%
- **الحل المقترح**: استخدام Redis للـ caching

### 2. تحسين رسائل الأخطاء
- **الموقع**: متعدد
- **الوصف**: رسائل الأخطاء عامة جداً
- **الفائدة**: تجربة مستخدم أفضل
- **الحل المقترح**: رسائل أكثر وضوحاً ومساعدة

## ✅ نقاط قوة

- ✅ استخدام TypeScript بشكل صحيح
- ✅ Error handling موجود في معظم endpoints
- ✅ Authentication middleware مُطبق بشكل جيد
- ✅ Code style متسق ونظيف

## الخطوات التالية

### الأولوية القصوى (هذا الأسبوع)
1. تشفير كلمات المرور
2. إصلاح SQL Injection
3. إضافة rate limiting

### الأولوية العالية (الأسبوع القادم)
1. نقل business logic إلى services
2. إضافة pagination
3. تحسين error handling

### الأولوية المتوسطة (خلال شهر)
1. إضافة caching
2. تحسين رسائل الأخطاء
3. إضافة comprehensive tests
```
