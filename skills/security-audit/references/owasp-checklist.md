# OWASP Top 10 2021 - قائمة التحقق الكاملة

## A01:2021 – Broken Access Control

### الوصف
فشل في تطبيق قيود الوصول بشكل صحيح، مما يسمح للمستخدمين بالوصول لموارد أو تنفيذ إجراءات غير مصرح بها.

### نقاط التحقق

#### Vertical Access Control
- [ ] **Role-based checks** على جميع endpoints الحساسة
- [ ] **Admin routes** محمية بـ role verification
- [ ] **Privilege escalation** محمي
- [ ] **Default deny** policy مُطبقة

```typescript
// ✅ مثال صحيح
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

app.delete('/api/users/:id', authenticate, requireAdmin, deleteUser);
```

#### Horizontal Access Control
- [ ] **Ownership checks** قبل الوصول للموارد
- [ ] **User ID verification** في جميع العمليات
- [ ] **Direct object references** محمية
- [ ] **IDOR vulnerabilities** مُختبرة

```typescript
// ✅ مثال صحيح
app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await db.orders.findById(req.params.id);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // التحقق من الملكية
  if (order.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(order);
});
```

#### CORS Misconfiguration
- [ ] **Origins محددة** (لا `*` في production)
- [ ] **Credentials** مُفعّل فقط عند الحاجة
- [ ] **Methods** محددة فقط المطلوبة
- [ ] **Preflight requests** مُعالجة بشكل صحيح

---

## A02:2021 – Cryptographic Failures

### الوصف
فشل في حماية البيانات الحساسة أثناء النقل أو التخزين باستخدام التشفير المناسب.

### نقاط التحقق

#### Data in Transit
- [ ] **HTTPS enforced** في production
- [ ] **TLS 1.2+** فقط
- [ ] **Strong cipher suites** مُستخدمة
- [ ] **HSTS header** مُفعّل
- [ ] **Certificate validation** صحيح

```typescript
// ✅ إجبار HTTPS في Express
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});
```

#### Data at Rest
- [ ] **Sensitive data encrypted** في قاعدة البيانات
- [ ] **Encryption keys** مُخزّنة بشكل آمن
- [ ] **Key rotation** دوري
- [ ] **Backups encrypted**

```typescript
// ✅ تشفير البيانات الحساسة
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}
```

#### Password Storage
- [ ] **bcrypt/argon2/scrypt** للتشفير
- [ ] **Salt** فريد لكل كلمة مرور
- [ ] **Cost factor** مناسب (10+ لـ bcrypt)
- [ ] **No reversible encryption** لكلمات المرور

```typescript
// ✅ تشفير كلمات المرور بـ bcrypt
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}
```

---

## A03:2021 – Injection

### الوصف
إدخال بيانات غير موثوقة في أوامر أو استعلامات، مما يسمح بتنفيذ كود ضار.

### نقاط التحقق

#### SQL Injection
- [ ] **Parameterized queries** حصراً
- [ ] **ORM/Query builder** مُستخدم
- [ ] **Input validation** قبل الاستعلامات
- [ ] **Least privilege** لحسابات DB

```typescript
// ❌ خطر: SQL Injection
const userId = req.params.id;
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.query(query);

// ✅ آمن: Parameterized query
const userId = req.params.id;
const query = 'SELECT * FROM users WHERE id = ?';
db.query(query, [userId]);
```

#### NoSQL Injection
- [ ] **Type validation** للـ query parameters
- [ ] **Avoid $where** في MongoDB
- [ ] **Sanitize inputs** قبل queries
- [ ] **Use query builders**

```typescript
// ❌ خطر: NoSQL Injection
const username = req.body.username;
db.users.findOne({ username: username });

// ✅ آمن: Type validation
const username = String(req.body.username);
if (typeof username !== 'string') {
  throw new Error('Invalid username type');
}
db.users.findOne({ username });
```

#### XSS (Cross-Site Scripting)
- [ ] **Output encoding** لجميع user inputs
- [ ] **CSP header** مُفعّل
- [ ] **HttpOnly cookies**
- [ ] **Avoid dangerouslySetInnerHTML**
- [ ] **DOMPurify** للـ HTML sanitization

```typescript
// ✅ CSP Header
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  }
}));
```

#### Command Injection
- [ ] **Avoid exec/eval** مع user input
- [ ] **Whitelist** للأوامر المسموحة
- [ ] **Input validation** صارم
- [ ] **Sandboxing** للعمليات الخطرة

```typescript
// ❌ خطر: Command Injection
const filename = req.body.filename;
exec(`cat ${filename}`, (error, stdout) => {
  res.send(stdout);
});

// ✅ آمن: استخدام fs بدلاً من exec
import fs from 'fs/promises';
const filename = path.basename(req.body.filename); // منع path traversal
const filepath = path.join('/safe/directory', filename);
const content = await fs.readFile(filepath, 'utf8');
res.send(content);
```

---

## A04:2021 – Insecure Design

### الوصف
عيوب في التصميم الأمني للتطبيق، وليس مجرد أخطاء في التنفيذ.

### نقاط التحقق

#### Threat Modeling
- [ ] **Threat model** موثّق
- [ ] **Attack surface** محدد
- [ ] **Security requirements** واضحة
- [ ] **Risk assessment** مُنفّذ

#### Security Patterns
- [ ] **Defense in depth** مُطبق
- [ ] **Fail securely** في جميع الحالات
- [ ] **Least privilege** principle
- [ ] **Separation of duties**

#### Business Logic
- [ ] **Rate limiting** على العمليات الحرجة
- [ ] **Transaction limits** محددة
- [ ] **Workflow validation** صحيح
- [ ] **State machine** محمي

```typescript
// ✅ مثال: حماية عملية شراء
class PurchaseService {
  async purchase(userId: string, itemId: string, quantity: number) {
    // 1. التحقق من الحدود
    if (quantity > 10) {
      throw new Error('Maximum 10 items per purchase');
    }
    
    // 2. التحقق من الرصيد
    const user = await this.userRepo.findById(userId);
    const item = await this.itemRepo.findById(itemId);
    const totalCost = item.price * quantity;
    
    if (user.balance < totalCost) {
      throw new Error('Insufficient balance');
    }
    
    // 3. Transaction آمن
    await this.db.transaction(async (trx) => {
      await this.userRepo.decrementBalance(userId, totalCost, trx);
      await this.itemRepo.decrementStock(itemId, quantity, trx);
      await this.orderRepo.create({ userId, itemId, quantity }, trx);
    });
  }
}
```

---

## A05:2021 – Security Misconfiguration

### الوصف
إعدادات أمنية غير صحيحة أو ناقصة في التطبيق أو البنية التحتية.

### نقاط التحقق

#### Security Headers
- [ ] **Helmet.js** مُستخدم
- [ ] **CSP** مُعد بشكل صحيح
- [ ] **HSTS** مُفعّل
- [ ] **X-Frame-Options** مُعد
- [ ] **X-Content-Type-Options** مُعد

#### Error Handling
- [ ] **Stack traces** مخفية في production
- [ ] **Error messages** عامة للمستخدمين
- [ ] **Detailed errors** في logs فقط
- [ ] **No sensitive info** في الأخطاء

```typescript
// ✅ Error handling آمن
app.use((err, req, res, next) => {
  // Log الخطأ الكامل
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id
  });
  
  // رسالة عامة للمستخدم
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An error occurred'
      : err.message
  });
});
```

#### Default Configurations
- [ ] **Default passwords** مُغيّرة
- [ ] **Unnecessary features** مُعطّلة
- [ ] **Debug mode** مُعطّل في production
- [ ] **Directory listing** مُعطّل

---

## A06:2021 – Vulnerable and Outdated Components

### الوصف
استخدام مكتبات أو frameworks قديمة أو بها ثغرات أمنية معروفة.

### نقاط التحقق

#### Dependency Management
- [ ] **npm audit** يُشغّل دورياً
- [ ] **Automated updates** (Dependabot, Renovate)
- [ ] **Security advisories** مُراقبة
- [ ] **Unused dependencies** مُزالة

```bash
# فحص الثغرات
npm audit

# إصلاح تلقائي
npm audit fix

# إصلاح شامل (قد يكسر التوافق)
npm audit fix --force

# استخدام Snyk
npx snyk test
npx snyk monitor
```

#### Version Pinning
- [ ] **Lock files** مُحدّثة (package-lock.json)
- [ ] **Exact versions** للـ critical dependencies
- [ ] **Version ranges** محددة بعناية
- [ ] **Regular updates** مجدولة

---

## A07:2021 – Identification and Authentication Failures

### الوصف
فشل في التحقق من هوية المستخدم أو إدارة الجلسات بشكل صحيح.

### نقاط التحقق

#### Password Policy
- [ ] **Minimum length** (8+ characters)
- [ ] **Complexity requirements**
- [ ] **Password strength meter**
- [ ] **Common passwords** محظورة
- [ ] **Password history** (لا إعادة استخدام)

```typescript
// ✅ Password validation
import zxcvbn from 'zxcvbn';

function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  
  const result = zxcvbn(password);
  if (result.score < 3) {
    return { valid: false, message: 'Password is too weak' };
  }
  
  return { valid: true };
}
```

#### Multi-Factor Authentication
- [ ] **MFA available** للمستخدمين
- [ ] **TOTP/SMS/Email** options
- [ ] **Backup codes** متاحة
- [ ] **MFA enforcement** للحسابات الحساسة

#### Account Security
- [ ] **Account lockout** بعد محاولات فاشلة
- [ ] **Password reset** آمن (tokens محدودة)
- [ ] **Email verification** للحسابات الجديدة
- [ ] **Session timeout** محدد

```typescript
// ✅ Account lockout
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 دقيقة

async function handleFailedLogin(userId: string) {
  const user = await db.users.findById(userId);
  
  user.failedAttempts = (user.failedAttempts || 0) + 1;
  
  if (user.failedAttempts >= MAX_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
  }
  
  await user.save();
}
```

---

## A08:2021 – Software and Data Integrity Failures

### الوصف
فشل في التحقق من سلامة البرمجيات والبيانات، مما يسمح بتعديلات غير مصرح بها.

### نقاط التحقق

#### CI/CD Security
- [ ] **Pipeline security** مُراجع
- [ ] **Secrets management** في CI/CD
- [ ] **Code signing** للـ releases
- [ ] **Artifact verification**

#### Dependency Integrity
- [ ] **Subresource Integrity** (SRI) للـ CDN
- [ ] **Package signatures** مُتحقق منها
- [ ] **Checksum verification**
- [ ] **Private registry** للـ internal packages

```html
<!-- ✅ SRI للـ CDN resources -->
<script 
  src="https://cdn.example.com/library.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/ux..."
  crossorigin="anonymous">
</script>
```

---

## A09:2021 – Security Logging and Monitoring Failures

### الوصف
عدم كفاية التسجيل والمراقبة للأحداث الأمنية.

### نقاط التحقق

#### Logging
- [ ] **Security events** مُسجّلة
- [ ] **Authentication attempts** مُسجّلة
- [ ] **Authorization failures** مُسجّلة
- [ ] **Input validation failures** مُسجّلة
- [ ] **No sensitive data** في logs

```typescript
// ✅ Security logging
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'security.log' })
  ]
});

// Log security events
logger.info('login_attempt', {
  userId: user.id,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true
});

logger.warn('authorization_failure', {
  userId: req.user.id,
  resource: req.path,
  action: req.method,
  ip: req.ip
});
```

#### Monitoring
- [ ] **Real-time alerts** للأحداث الحرجة
- [ ] **Anomaly detection**
- [ ] **Log retention policy**
- [ ] **Log integrity** محمي

---

## A10:2021 – Server-Side Request Forgery (SSRF)

### الوصف
السماح للمهاجم بإجبار التطبيق على إرسال طلبات لموارد غير مصرح بها.

### نقاط التحقق

#### URL Validation
- [ ] **Whitelist** للـ domains المسموحة
- [ ] **URL parsing** صحيح
- [ ] **Protocol restrictions** (http/https فقط)
- [ ] **IP address validation**

```typescript
// ✅ SSRF protection
import { URL } from 'url';

const ALLOWED_DOMAINS = ['api.example.com', 'cdn.example.com'];

function validateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    
    // فقط http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }
    
    // منع localhost و internal IPs
    const hostname = url.hostname;
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.')
    ) {
      return false;
    }
    
    // Whitelist domains
    return ALLOWED_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}
```

#### Network Segmentation
- [ ] **Firewall rules** محددة
- [ ] **Internal services** غير متاحة من الخارج
- [ ] **DMZ** للخدمات العامة
- [ ] **VPN** للوصول الداخلي
