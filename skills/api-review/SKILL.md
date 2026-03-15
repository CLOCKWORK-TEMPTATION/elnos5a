---
name: api-review
description: مراجعة شاملة لـ API routes وcontrollers وservices من حيث التحقق من المدخلات، معالجة الأخطاء، فصل المسؤوليات، والأمان. استخدم عند مراجعة كود API، فحص endpoints، تدقيق controllers، أو عند طلب مراجعة backend code، API security، input validation، error handling.
---

# مراجعة API Routes/Controllers/Services

## متى تستخدم

استخدم هذه المهارة عند مراجعة كود الـ API أو الطبقات الخلفية، تحديداً عند:

- مراجعة routes أو controllers أو services
- فحص input validation أو error handling
- تدقيق API security أو separation of concerns
- طلب backend code review أو مراجعة endpoints

## تصنيف الأسباب الجذرية

صنّف كل مشكلة ضمن سبب جذري واحد:

- `validation-gap`: مدخلات غير محققة أو مكشوفة لـ injection attacks
- `error-exposure`: أخطاء تكشف معلومات حساسة أو لا تُعالج بشكل صحيح
- `layer-violation`: business logic في route/controller، أو database access خارج الطبقة الصحيحة
- `auth-gap`: authentication أو authorization غائب أو ناقص على endpoint
- `performance-risk`: N+1 queries، أو غياب pagination أو caching

ابدأ بالسبب الجذري ثم وصف العَرَض.

## المرجعية في المشروع

الطبقات الرئيسية في هذا المشروع:

- `server/routes/index.mjs` — تعريف جميع الـ routes
- `server/controllers/` — controllers لكل endpoint (`.mjs`)
- `server/*.mjs` — services ومنطق الأعمال

Endpoints الرئيسية:
- `POST /api/file-extract` — استخراج نص من ملفات
- `POST /api/agent/review` — مراجعة AI للأسطر المشبوهة
- `POST /api/final-review` — المراجعة النهائية (Command API v2)
- `POST /api/ai/context-enhance` / `POST /api/ai/doubt-resolve` — SSE endpoints
- `POST /api/export/pdfa` — تصدير PDF

## نقطة البداية السريعة

1. حدد الـ endpoint أو الطبقة المراد مراجعتها.
2. ابدأ بفحص الأمان: authentication، authorization، input validation.
3. تحقق من error handling وresponse structure.
4. راجع فصل المسؤوليات (routes → controllers → services).
5. صنّف الملاحظات: 🔴 حرج، 🟡 مهم، 🟢 تحسين.

## قائمة المراجعة الأساسية

عند مراجعة أي API route/controller/service، تحقق من:

### 1️⃣ التحقق من المدخلات (Input Validation)

- [ ] **جميع المدخلات تُتحقق منها** قبل المعالجة
- [ ] **استخدام مكتبة validation** (مثل Zod، Joi، class-validator)
- [ ] **رسائل خطأ واضحة** للمدخلات غير الصحيحة
- [ ] **التحقق من الأنواع** (types) والقيم المسموحة
- [ ] **حماية من injection attacks** (SQL, NoSQL, XSS)
- [ ] **تحديد حجم المدخلات** (max length, file size)

### 2️⃣ معالجة الأخطاء (Error Handling)

- [ ] **try-catch blocks** في جميع العمليات الحرجة
- [ ] **أخطاء مُصنفة** (4xx للعميل، 5xx للخادم)
- [ ] **رسائل خطأ آمنة** (لا تكشف معلومات حساسة)
- [ ] **logging مناسب** للأخطاء
- [ ] **معالجة async errors** بشكل صحيح
- [ ] **fallback mechanisms** للعمليات الحرجة

### 3️⃣ فصل المسؤوليات (Separation of Concerns)

- [ ] **Routes**: فقط routing وvalidation أولية
- [ ] **Controllers**: تنسيق الطلبات والاستجابات
- [ ] **Services**: منطق الأعمال (business logic)
- [ ] **Models/Repositories**: الوصول للبيانات
- [ ] **لا يوجد business logic في routes**
- [ ] **لا يوجد database queries في controllers**

### 4️⃣ الأمان (Security)

- [ ] **Authentication** مُطبق على endpoints المحمية
- [ ] **Authorization** للتحقق من الصلاحيات
- [ ] **Rate limiting** لمنع الإساءة
- [ ] **CORS** مُعد بشكل صحيح
- [ ] **Sanitization** للمدخلات
- [ ] **Secrets** لا تُخزن في الكود

### 5️⃣ الأداء (Performance)

- [ ] **Pagination** للقوائم الطويلة
- [ ] **Caching** للبيانات المتكررة
- [ ] **Database queries محسّنة** (N+1 problem)
- [ ] **Async operations** حيث مناسب
- [ ] **Timeouts** للعمليات الطويلة

## سير العمل

### المرحلة 1: الفحص السريع

```markdown
**نقاط التحقق السريع:**
- [ ] هل البنية واضحة؟ (routes → controllers → services)
- [ ] هل يوجد validation للمدخلات؟
- [ ] هل يوجد error handling؟
- [ ] هل الأمان مُطبق؟
```

### المرحلة 2: المراجعة التفصيلية

لكل طبقة، راجع:

#### Routes Layer
```typescript
// ✅ جيد: route نظيف مع validation
router.post('/users', 
  validateRequest(createUserSchema),
  authMiddleware,
  userController.createUser
);

// ❌ سيء: business logic في route
router.post('/users', async (req, res) => {
  const user = await db.users.create(req.body); // مباشرة!
  res.json(user);
});
```

#### Controllers Layer
```typescript
// ✅ جيد: controller ينسق فقط
async createUser(req, res, next) {
  try {
    const userData = req.validatedBody;
    const user = await userService.createUser(userData);
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// ❌ سيء: business logic في controller
async createUser(req, res) {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  const user = await db.users.create({ ...req.body, password: hashedPassword });
  await emailService.sendWelcome(user.email);
  res.json(user);
}
```

#### Services Layer
```typescript
// ✅ جيد: service يحتوي business logic
class UserService {
  async createUser(userData: CreateUserDTO) {
    const hashedPassword = await this.hashPassword(userData.password);
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword
    });
    await this.emailService.sendWelcome(user.email);
    return this.sanitizeUser(user);
  }
}

// ❌ سيء: service يعمل database queries مباشرة
class UserService {
  async createUser(userData) {
    return await db.users.create(userData); // يجب استخدام repository
  }
}
```

### المرحلة 3: تقديم الملاحظات

صنف الملاحظات حسب الأولوية:

- 🔴 **حرج (Critical)**: يجب إصلاحه فوراً (ثغرات أمنية، أخطاء منطقية)
- 🟡 **مهم (Important)**: يجب إصلاحه قريباً (معالجة أخطاء، validation)
- 🟢 **تحسين (Enhancement)**: اختياري (refactoring، performance)

## أنماط شائعة يجب تجنبها

### ❌ Anti-Pattern 1: God Controller
```typescript
// سيء: controller يفعل كل شيء
class UserController {
  async createUser(req, res) {
    // validation
    if (!req.body.email) return res.status(400).json({error: 'Email required'});
    // business logic
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    // database access
    const user = await db.users.create({...});
    // email sending
    await sendEmail(user.email, 'Welcome!');
    res.json(user);
  }
}
```

### ❌ Anti-Pattern 2: Missing Error Handling
```typescript
// سيء: لا يوجد error handling
router.get('/users/:id', async (req, res) => {
  const user = await db.users.findById(req.params.id); // ماذا لو فشل؟
  res.json(user); // ماذا لو user = null؟
});
```

### ❌ Anti-Pattern 3: No Input Validation
```typescript
// سيء: لا يوجد validation
router.post('/users', async (req, res) => {
  const user = await userService.create(req.body); // أي شيء يمكن أن يُرسل!
  res.json(user);
});
```

### ❌ Anti-Pattern 4: Exposing Sensitive Data
```typescript
// سيء: إرجاع كل البيانات بما فيها الحساسة
async getUser(req, res) {
  const user = await db.users.findById(req.params.id);
  res.json(user); // يتضمن password hash، tokens، إلخ
}
```

## قالب التقرير

استخدم هذا القالب عند تقديم تقرير المراجعة:

```markdown
# مراجعة API: [اسم الـ endpoint/module]

## ملخص تنفيذي
[نظرة عامة سريعة على الحالة والمشاكل الرئيسية]

## 🔴 مشاكل حرجة (يجب إصلاحها فوراً)
1. **[المشكلة]**
   - الموقع: `path/to/file.ts:line`
   - الوصف: [شرح المشكلة]
   - الحل المقترح: [كيفية الإصلاح]

## 🟡 مشاكل مهمة (يجب إصلاحها قريباً)
1. **[المشكلة]**
   - الموقع: `path/to/file.ts:line`
   - الوصف: [شرح المشكلة]
   - الحل المقترح: [كيفية الإصلاح]

## 🟢 تحسينات مقترحة
1. **[التحسين]**
   - الموقع: `path/to/file.ts:line`
   - الوصف: [شرح التحسين]
   - الفائدة: [لماذا هذا مفيد]

## ✅ نقاط قوة
- [ما تم عمله بشكل جيد]

## الخطوات التالية
1. [أولوية 1]
2. [أولوية 2]
3. [أولوية 3]
```

## قواعد التقرير

1. **ابدأ بالأمان**: الثغرات الأمنية لها الأولوية القصوى
2. **تحقق من الأساسيات**: validation وerror handling أولاً
3. **راجع البنية**: هل فصل المسؤوليات واضح؟
4. **فكر في الأداء**: هل هناك bottlenecks محتملة؟
5. **اقرأ الكود كمستخدم**: هل الـ API سهل الاستخدام؟

## المراجع

- [references/examples.md](references/examples.md) — أمثلة تفصيلية لمراجعات API
- [references/standards.md](references/standards.md) — معايير تفصيلية لكل طبقة
