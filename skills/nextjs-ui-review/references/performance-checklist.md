# قائمة تحسين الأداء في Next.js 15

## 1. الصور (Images)

### ✅ قائمة التحقق

```
- [ ] استخدام next/image بدلاً من <img>
- [ ] تحديد width و height لكل صورة
- [ ] استخدام priority للصور فوق الطية (above the fold)
- [ ] استخدام loading="lazy" للصور تحت الطية
- [ ] اختيار format مناسب (WebP, AVIF)
- [ ] استخدام sizes للصور المتجاوبة
- [ ] تحسين صور الخلفية (background images)
```

### أمثلة

```typescript
// ✅ صحيح: next/image مع جميع الخصائص
import Image from 'next/image'

function Hero() {
  return (
    <Image
      src="/hero.jpg"
      alt="Hero image"
      width={1200}
      height={600}
      priority // للصور المهمة فوق الطية
      quality={90}
    />
  )
}

// ✅ صحيح: صور متجاوبة
<Image
  src="/product.jpg"
  alt="Product"
  width={800}
  height={600}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>

// ❌ خطأ: <img> عادي
<img src="/hero.jpg" alt="Hero" />

// ❌ خطأ: بدون width/height
<Image src="/hero.jpg" alt="Hero" />
```

---

## 2. Code Splitting & Dynamic Imports

### ✅ قائمة التحقق

```
- [ ] استخدام dynamic() للمكونات الثقيلة
- [ ] تعطيل SSR للمكونات التي تستخدم browser APIs
- [ ] lazy loading للمكونات غير المرئية في البداية
- [ ] تقسيم route-based code splitting
- [ ] تجنب استيراد مكتبات كاملة
```

### أمثلة

```typescript
import dynamic from 'next/dynamic'

// ✅ صحيح: dynamic import للمكونات الثقيلة
const HeavyChart = dynamic(() => import('./HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false // إن كان يستخدم window/document
})

// ✅ صحيح: dynamic import مع named export
const AdminPanel = dynamic(() => import('./AdminPanel').then(mod => mod.AdminPanel), {
  loading: () => <div>Loading admin panel...</div>
})

// ✅ صحيح: استيراد جزئي من المكتبات
import { debounce } from 'lodash-es' // ✅
import debounce from 'lodash/debounce' // ✅

// ❌ خطأ: استيراد كامل المكتبة
import _ from 'lodash' // ❌ يستورد كل lodash
import * as _ from 'lodash' // ❌
```

---

## 3. React Rendering Optimization

### ✅ قائمة التحقق

```
- [ ] استخدام React.memo للمكونات الثقيلة فقط
- [ ] useCallback للدوال الممررة كـ props
- [ ] useMemo للحسابات الثقيلة فقط
- [ ] تجنب inline functions في props
- [ ] تجنب inline objects/arrays في props
- [ ] مراجعة dependencies في useEffect/useMemo/useCallback
```

### أمثلة

```typescript
// ✅ صحيح: memo للمكونات الثقيلة
const HeavyList = memo(function HeavyList({ items }: { items: Item[] }) {
  return (
    <ul>
      {items.map(item => (
        <ExpensiveItem key={item.id} item={item} />
      ))}
    </ul>
  )
})

// ✅ صحيح: useCallback للدوال
function Parent() {
  const handleClick = useCallback((id: string) => {
    console.log('Clicked:', id)
  }, [])
  
  return <MemoizedChild onClick={handleClick} />
}

// ❌ خطأ: inline function
function Parent() {
  return <MemoizedChild onClick={(id) => console.log(id)} /> // ❌ دالة جديدة في كل render
}

// ❌ خطأ: inline object
function Parent() {
  return <Child style={{ color: 'red' }} /> // ❌ كائن جديد في كل render
}

// ✅ صحيح: كائن ثابت خارج المكون
const STYLE = { color: 'red' }

function Parent() {
  return <Child style={STYLE} />
}
```

---

## 4. Server Components Optimization

### ✅ قائمة التحقق

```
- [ ] استخدام Server Components للبيانات الثابتة
- [ ] تجنب 'use client' بلا داعٍ
- [ ] جلب البيانات في Server Components
- [ ] استخدام Suspense مع Server Components
- [ ] تجنب تمرير دوال من Server → Client
- [ ] استخدام streaming للبيانات الكبيرة
```

### أمثلة

```typescript
// ✅ صحيح: Server Component للبيانات
async function ProductList() {
  const products = await db.product.findMany()
  
  return (
    <div>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}

// ✅ صحيح: Suspense مع Server Component
<Suspense fallback={<ProductListSkeleton />}>
  <ProductList />
</Suspense>

// ✅ صحيح: streaming للبيانات الكبيرة
async function Dashboard() {
  return (
    <div>
      <Suspense fallback={<Skeleton />}>
        <SlowDataComponent />
      </Suspense>
      <FastDataComponent />
    </div>
  )
}

// ❌ خطأ: 'use client' بلا داعٍ
'use client'

function StaticHeader() {
  return <header>Welcome</header> // ❌ لا يحتاج 'use client'
}
```

---

## 5. Bundle Size Optimization

### ✅ قائمة التحقق

```
- [ ] تحليل bundle size بانتظام
- [ ] إزالة dependencies غير المستخدمة
- [ ] استخدام tree-shaking
- [ ] تجنب استيراد CSS غير المستخدم
- [ ] استخدام production build
- [ ] تفعيل compression (gzip/brotli)
```

### أدوات التحليل

```bash
# تحليل bundle size
pnpm build
pnpm analyze

# أو استخدم @next/bundle-analyzer
pnpm add -D @next/bundle-analyzer
```

```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // ... config
})
```

```bash
# تشغيل التحليل
ANALYZE=true pnpm build
```

---

## 6. Fonts Optimization

### ✅ قائمة التحقق

```
- [ ] استخدام next/font
- [ ] تحميل الخطوط من local بدلاً من CDN
- [ ] استخدام font-display: swap
- [ ] تحديد subsets المطلوبة فقط
- [ ] preload للخطوط الأساسية
```

### أمثلة

```typescript
// app/layout.tsx
import { Cairo } from 'next/font/google'

// ✅ صحيح: next/font مع تحسينات
const cairo = Cairo({
  subsets: ['arabic'], // فقط الأحرف العربية
  display: 'swap', // تجنب FOIT
  variable: '--font-cairo',
  preload: true
})

export default function RootLayout({ children }) {
  return (
    <html lang="ar" className={cairo.variable}>
      <body>{children}</body>
    </html>
  )
}

// ❌ خطأ: تحميل من CDN
<link href="https://fonts.googleapis.com/css2?family=Cairo" rel="stylesheet" />
```

---

## 7. Data Fetching Optimization

### ✅ قائمة التحقق

```
- [ ] استخدام fetch مع cache في Server Components
- [ ] تجنب waterfall requests
- [ ] استخدام parallel fetching
- [ ] استخدام React Query/SWR للـ caching
- [ ] تفعيل ISR للصفحات شبه الثابتة
- [ ] استخدام streaming للبيانات الكبيرة
```

### أمثلة

```typescript
// ❌ خطأ: waterfall requests
async function Page() {
  const user = await fetchUser()
  const posts = await fetchPosts(user.id) // ينتظر user
  return <div>...</div>
}

// ✅ صحيح: parallel fetching
async function Page() {
  const [user, posts] = await Promise.all([
    fetchUser(),
    fetchPosts()
  ])
  return <div>...</div>
}

// ✅ صحيح: fetch مع cache
async function getData() {
  const res = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 } // cache لمدة ساعة
  })
  return res.json()
}

// ✅ صحيح: ISR
export const revalidate = 3600 // revalidate كل ساعة

async function Page() {
  const data = await getData()
  return <div>{data}</div>
}
```

---

## 8. CSS Optimization

### ✅ قائمة التحقق

```
- [ ] استخدام CSS Modules أو Tailwind
- [ ] تجنب CSS-in-JS في Server Components
- [ ] إزالة CSS غير المستخدم
- [ ] استخدام critical CSS
- [ ] تقليل حجم CSS
- [ ] استخدام CSS variables بدلاً من inline styles
```

### أمثلة

```typescript
// ✅ صحيح: Tailwind CSS
function Button() {
  return <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600">Click</button>
}

// ✅ صحيح: CSS Modules
import styles from './Button.module.css'

function Button() {
  return <button className={styles.button}>Click</button>
}

// ❌ خطأ: inline styles كثيرة
function Button() {
  return (
    <button style={{
      padding: '8px 16px',
      backgroundColor: 'blue',
      color: 'white',
      borderRadius: '4px'
    }}>
      Click
    </button>
  )
}

// ✅ صحيح: CSS variables
// globals.css
:root {
  --button-padding: 8px 16px;
  --button-bg: blue;
}

function Button() {
  return <button className="button">Click</button>
}
```

---

## 9. Third-Party Scripts

### ✅ قائمة التحقق

```
- [ ] استخدام next/script
- [ ] تحديد strategy مناسب (afterInteractive, lazyOnload)
- [ ] تأجيل السكريبتات غير الضرورية
- [ ] تجنب blocking scripts
```

### أمثلة

```typescript
import Script from 'next/script'

// ✅ صحيح: next/script مع strategy
function Layout({ children }) {
  return (
    <>
      {children}
      
      {/* Analytics - بعد التفاعل */}
      <Script
        src="https://www.googletagmanager.com/gtag/js"
        strategy="afterInteractive"
      />
      
      {/* Chat widget - عند الحاجة */}
      <Script
        src="https://widget.example.com/chat.js"
        strategy="lazyOnload"
      />
    </>
  )
}

// ❌ خطأ: <script> عادي
<script src="https://example.com/script.js"></script>
```

---

## 10. Monitoring & Debugging

### ✅ قائمة التحقق

```
- [ ] استخدام React DevTools Profiler
- [ ] مراقبة Core Web Vitals
- [ ] استخدام Lighthouse
- [ ] تتبع bundle size
- [ ] مراقبة re-renders
```

### أدوات

```bash
# Lighthouse
npx lighthouse http://localhost:3000 --view

# Bundle analyzer
ANALYZE=true pnpm build

# React DevTools Profiler
# افتح React DevTools → Profiler → Start profiling
```

---

## ملخص سريع

### أولويات التحسين

1. **عالية الأولوية:**
   - استخدام next/image
   - Server Components للبيانات
   - Dynamic imports للمكونات الثقيلة
   - تجنب 'use client' بلا داعٍ

2. **متوسطة الأولوية:**
   - React.memo للمكونات الثقيلة
   - useCallback/useMemo عند الحاجة
   - Parallel data fetching
   - Font optimization

3. **منخفضة الأولوية:**
   - CSS optimization
   - Third-party scripts optimization
   - Advanced caching strategies

### قاعدة ذهبية

> **لا تحسّن قبل القياس** - استخدم Profiler وLighthouse لتحديد الاختناقات الفعلية قبل التحسين
