---
name: nextjs-ui-review
description: مراجعة شاملة للواجهة في Next.js 15 + React 19 تشمل الصفحات، المكونات، الخطافات، إدارة الحالة، والتمييز بين Server و Client Components. استخدم عند طلب مراجعة UI، فحص الواجهة، تدقيق المكونات، تحليل App Router، فحص Server Components، مراجعة Client Components، تحليل الخطافات، أو فحص إدارة الحالة.
---

# مراجعة الواجهة في Next.js 15 + React 19

## متى تستخدم

استخدم هذه المهارة عند مراجعة الواجهة في تطبيق Next.js 15 + React 19، تحديداً عند:

- مراجعة UI أو فحص المكونات أو تدقيق App Router
- فحص Server Components مقابل Client Components
- مراجعة Custom Hooks أو إدارة الحالة
- تحليل الأداء أو تحسين bundle size

## تصنيف الأسباب الجذرية

صنّف كل مشكلة ضمن سبب جذري واحد:

- `client-boundary-overuse`: استخدام `'use client'` بلا داعٍ يكبّر bundle العميل
- `state-misplacement`: بيانات server في `useState` بدلاً من Server Components
- `hook-misuse`: dependencies ناقصة في `useEffect`، أو hooks خارج Client Components
- `composition-issue`: props drilling عميق أو Context ضخم غير مقسّم
- `performance-regression`: re-renders غير ضرورية، أو غياب memo/lazy

ابدأ بالسبب الجذري ثم وصف العَرَض.

## المرجعية في المشروع

- `app/` — App Router pages وlayouts (Next.js 15)
- `src/components/app-shell/` — AppHeader، AppSidebar، AppDock، AppFooter
- `src/components/editor/` — مكونات محرر السيناريو
- `src/components/ui/` — 53 مكون Radix UI (DOM factory pattern، بدون JSX)
- المشروع يدعم الوضع الداكن فقط، RTL-first، TypeScript strict

## نقطة البداية السريعة

1. حدد المكونات المستهدفة وافهم بنية `app/` + `src/components/`.
2. تحقق من Server vs Client لكل مكون، لا تستخدم `'use client'` إلا عند الحاجة.
3. راجع جودة Props وTypeScript types في كل مكون.
4. افحص dependencies في hooks وتحقق من غياب loops لا نهائية.
5. صنّف المشاكل: 🔴 حرج، 🟡 مقترح، 🟢 نقاط قوة.

---

## سير العمل

### المرحلة 1: تحليل البنية العامة

**قائمة التحقق:**
```
- [ ] فحص هيكل app/ (App Router)
- [ ] تحديد الصفحات والمسارات (routes)
- [ ] التحقق من layout.tsx و page.tsx
- [ ] فحص loading.tsx و error.tsx
- [ ] مراجعة not-found.tsx
```

**الأسئلة الرئيسية:**
1. هل البنية تتبع اتفاقيات Next.js 15 App Router؟
2. هل هناك تداخل غير ضروري في المجلدات؟
3. هل الـ layouts متداخلة بشكل صحيح؟

---

### المرحلة 2: Server vs Client Components

**قاعدة ذهبية:** افترض Server Component ما لم تحتج:
- تفاعل المستخدم (onClick, onChange)
- Hooks (useState, useEffect, useContext)
- Browser APIs (window, localStorage)
- Event listeners

**قائمة التحقق:**
```
- [ ] تحديد المكونات التي تحتاج 'use client'
- [ ] التحقق من عدم استخدام 'use client' بلا داعٍ
- [ ] فحص تمرير البيانات من Server → Client
- [ ] التأكد من عدم تمرير دوال غير قابلة للتسلسل
- [ ] مراجعة استخدام async/await في Server Components
```

**نمط التحقق:**
```typescript
// ✅ صحيح: Server Component (افتراضي)
async function ProductList() {
  const products = await fetchProducts()
  return <div>{products.map(...)}</div>
}

// ✅ صحيح: Client Component (عند الحاجة)
'use client'
function InteractiveButton() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}

// ❌ خطأ: 'use client' بلا داعٍ
'use client'
function StaticHeader() {
  return <header>Welcome</header>
}
```

**للمزيد:** راجع [server-client-patterns.md](references/server-client-patterns.md)

---

### المرحلة 3: مراجعة المكونات

**معايير الجودة:**

1. **المسؤولية الواحدة:** كل مكون يقوم بمهمة واحدة فقط
2. **قابلية إعادة الاستخدام:** المكونات عامة وليست مرتبطة بسياق محدد
3. **Props واضحة:** أنواع TypeScript صريحة ومفهومة
4. **التركيب (Composition):** استخدام children بدلاً من التفرع المعقد

**قائمة التحقق:**
```
- [ ] Props لها أنواع TypeScript صريحة
- [ ] لا توجد props غير مستخدمة
- [ ] القيم الافتراضية محددة عند الحاجة
- [ ] المكونات صغيرة (<200 سطر)
- [ ] لا توجد منطق معقد داخل JSX
- [ ] استخدام memo() للمكونات الثقيلة فقط
```

**نمط المراجعة:**
```typescript
// ✅ صحيح: Props واضحة ومحددة
interface ButtonProps {
  variant: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  onClick: () => void
  children: React.ReactNode
}

function Button({ variant, size = 'md', onClick, children }: ButtonProps) {
  return <button className={cn(variants[variant], sizes[size])} onClick={onClick}>{children}</button>
}

// ❌ خطأ: Props غامضة
function Button(props: any) {
  return <button {...props} />
}
```

---

### المرحلة 4: مراجعة الخطافات (Hooks)

**قواعد الخطافات:**
- استخدم فقط في Client Components
- لا تستدعي داخل شروط أو حلقات
- اتبع تسمية `use*`
- تجنب الخطافات المعقدة جداً

**قائمة التحقق:**
```
- [ ] الخطافات المخصصة تبدأ بـ use
- [ ] Dependencies arrays صحيحة في useEffect/useMemo/useCallback
- [ ] لا توجد حلقات لا نهائية في useEffect
- [ ] استخدام useCallback للدوال الممررة كـ props
- [ ] استخدام useMemo للحسابات الثقيلة فقط
- [ ] تجنب useState لبيانات يمكن حسابها
```

**أنماط شائعة:**
```typescript
// ✅ صحيح: خطاف مخصص مع dependencies صحيحة
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay]) // ✅ dependencies كاملة
  
  return debouncedValue
}

// ❌ خطأ: dependencies ناقصة
useEffect(() => {
  fetchData(userId)
}, []) // ❌ userId مفقود
```

**للمزيد:** راجع [hooks-patterns.md](references/hooks-patterns.md)

---

### المرحلة 5: إدارة الحالة

**استراتيجية الاختيار:**

| الحالة | الحل المناسب | متى تستخدمه |
|--------|--------------|-------------|
| محلية | `useState` | حالة مكون واحد |
| مشتركة قريبة | Props drilling أو Context | 2-3 مستويات |
| عامة | Context API | حالة تطبيق عامة |
| معقدة | Zustand/Jotai | حالة معقدة مع منطق |
| خادم | Server Components + fetch | بيانات من API |

**قائمة التحقق:**
```
- [ ] لا يوجد props drilling عميق (>3 مستويات)
- [ ] Context لا يُعاد رسمه بلا داعٍ
- [ ] استخدام Server Components للبيانات الثابتة
- [ ] تجنب useState لبيانات الخادم
- [ ] استخدام React Query/SWR للـ caching إن لزم
```

**نمط Context الصحيح:**
```typescript
// ✅ صحيح: Context مقسم حسب المسؤولية
'use client'
const ThemeContext = createContext<Theme | null>(null)

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  
  // ✅ قيمة مستقرة لتجنب إعادة الرسم
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// ❌ خطأ: Context ضخم يحتوي كل شيء
const AppContext = createContext({
  user: null,
  theme: 'dark',
  settings: {},
  notifications: [],
  // ... 20 خاصية أخرى
})
```

**للمزيد:** راجع [state-management.md](references/state-management.md)

---

### المرحلة 6: الأداء والتحسينات

**نقاط التحقق:**

1. **Bundle Size:**
   - استخدام dynamic imports للمكونات الثقيلة
   - تجنب استيراد مكتبات كاملة

2. **Rendering:**
   - تجنب إعادة الرسم غير الضرورية
   - استخدام React.memo بحذر
   - مراجعة dependencies في useEffect

3. **Images:**
   - استخدام `next/image` دائماً
   - تحديد width/height
   - استخدام priority للصور المهمة

**قائمة التحقق:**
```
- [ ] استخدام next/image بدلاً من <img>
- [ ] dynamic() للمكونات الثقيلة
- [ ] لا توجد console.log في production
- [ ] استخدام Suspense مع lazy loading
- [ ] تجنب inline functions في props (استخدم useCallback)
```

**أنماط التحسين:**
```typescript
// ✅ صحيح: dynamic import
import dynamic from 'next/dynamic'
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false // إن كان يستخدم browser APIs
})

// ✅ صحيح: next/image
import Image from 'next/image'
<Image src="/hero.jpg" alt="Hero" width={800} height={600} priority />

// ❌ خطأ: استيراد كامل المكتبة
import _ from 'lodash' // ❌
import { debounce } from 'lodash' // ✅
```

---

## قالب التقرير

بعد المراجعة، قدم تقريراً بهذا الشكل:

```markdown
# تقرير مراجعة الواجهة

## 🔴 مشاكل حرجة (يجب الإصلاح)
- [ ] استخدام 'use client' في 15 مكون بلا داعٍ
- [ ] props drilling عميق في `UserProfile` (5 مستويات)
- [ ] dependencies ناقصة في `useEffect` في `Dashboard.tsx:45`

## 🟡 تحسينات مقترحة
- [ ] تقسيم `HomePage` (450 سطر) إلى مكونات أصغر
- [ ] استخدام dynamic import لـ `Chart` component
- [ ] إضافة TypeScript types لـ props في 8 مكونات

## 🟢 نقاط قوة
- ✅ استخدام صحيح لـ Server Components في الصفحات
- ✅ بنية App Router منظمة
- ✅ استخدام next/image في جميع الصور

## إحصائيات
- إجمالي المكونات: 45
- Server Components: 30 (67%)
- Client Components: 15 (33%)
- خطافات مخصصة: 8
- متوسط حجم المكون: 120 سطر
```

## قواعد التقرير

- ابدأ بفحص `'use client'` غير الضروري — bundle impact مباشر
- اسعمل أدوات الفحص التالية لتأكيد المشاكل، لا للملاحظة الذاتية فقط
- استشهد بالمكون ورقم السطر عند ذكر أي مشكلة
- لا تحسّن ما لم يذكره المستخدم بدون إذن

---

## أدوات مساعدة

### فحص 'use client' غير الضروري
```bash
# ابحث عن ملفات بها 'use client' لكن لا تستخدم hooks أو events
grep -r "use client" app/ src/ | while read file; do
  if ! grep -q "useState\|useEffect\|onClick\|onChange" "$file"; then
    echo "⚠️  Unnecessary 'use client': $file"
  fi
done
```

### تحليل حجم المكونات
```bash
# أكبر 10 مكونات
find src/components -name "*.tsx" -exec wc -l {} \; | sort -rn | head -10
```

---

## المراجع

- [references/server-client-patterns.md](references/server-client-patterns.md) - أنماط Server/Client Components
- [references/hooks-patterns.md](references/hooks-patterns.md) - أنماط الخطافات الشائعة
- [references/state-management.md](references/state-management.md) - استراتيجيات إدارة الحالة
- [references/performance-checklist.md](references/performance-checklist.md) - قائمة تحسين الأداء
