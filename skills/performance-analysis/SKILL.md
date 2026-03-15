---
name: performance-analysis
description: تحليل شامل لأداء التطبيقات يغطي حجم الحزم، اختناقات الأداء، استراتيجيات التخزين المؤقت، logging، وobservability. استخدم هذه المهارة عند طلب تحليل الأداء، فحص bundle size، تحسين الأداء، تشخيص الاختناقات، مراجعة caching، إعداد logging، أو تحسين observability.
---

# تحليل الأداء الشامل (Performance Analysis)

## متى تستخدم

استخدم هذه المهارة عند:

- طلب تحليل أداء أو فحص bundle size
- تشخيص اختناقات (bottlenecks) أو بطء في التحميل
- مراجعة استراتيجية caching أو logging
- إعداد observability أو مراجعة metrics/traces

## تصنيف الأسباب الجذرية

صنّف كل مشكلة أداء ضمن سبب جذري واحد:

- `bundle-bloat`: حزم كبيرة بسبب imports غير ضرورية، أو غياب tree shaking/code splitting
- `render-bottleneck`: re-renders زائدة، أو غياب `memo`/`lazy` في مسار حرج
- `cache-miss`: غياب caching أو تكوين cache headers خاطئ
- `log-noise`: سجلات زائدة أو غياب structured logging
- `observability-gap`: غياب metrics/traces/alerts أساسية

ابدأ بالسبب الجذري ثم وصف العَرَض.

## المرجعية في المشروع

- `pnpm build` — فحص `.next/analyze/` لـ bundle size
- `pnpm dev` / `pnpm test:e2e` — قياس runtime performance
- المشروع يستخدم `pino` للـ logging في backend
- Endpoint التصدير `POST /api/export/pdfa` حساس للأداء (Puppeteer)

## نقطة البداية السريعة

1. شغّل `pnpm build` وافحص تقرير bundle analyzer لتحديد أكبر الحزم.
2. استخدم Lighthouse أو Chrome DevTools لقياس Core Web Vitals.
3. صنّف كل مشكلة باستخدام نماذج `تصنيف الأسباب الجذرية`.
4. طبق تحسين واحد في المرة — قس ثم تحقّق من الأثر.
5. وثّق النتائج (baseline vs improved).

## سير العمل

### 1. تحليل حجم الحزم (Bundle Size Analysis)

### الفحص الأولي

```bash
# Next.js
pnpm build
# تحقق من .next/analyze/client.html و server.html

# Vite
pnpm build -- --mode production
npx vite-bundle-visualizer

# Webpack
npx webpack-bundle-analyzer dist/stats.json
```

### نقاط التحقق الرئيسية

- [ ] **حجم الحزمة الإجمالي** < 250KB (gzipped للصفحة الأولى)
- [ ] **أكبر 5 dependencies** - هل هي ضرورية؟
- [ ] **Code splitting** - هل يتم تقسيم الكود بشكل فعال؟
- [ ] **Tree shaking** - هل يعمل بشكل صحيح؟
- [ ] **Duplicate dependencies** - هل توجد نسخ مكررة؟

### استراتيجيات التحسين

**إزالة المكتبات الثقيلة:**
```typescript
// ❌ سيء - استيراد كامل المكتبة
import _ from 'lodash'

// ✅ جيد - استيراد انتقائي
import debounce from 'lodash/debounce'
```

**Dynamic imports للكود غير الحرج:**
```typescript
// ✅ تحميل lazy للمكونات الثقيلة
const HeavyChart = dynamic(() => import('@/components/HeavyChart'), {
  loading: () => <Skeleton />,
  ssr: false
})
```

**تحليل التبعيات:**
```bash
# فحص حجم كل dependency
npx cost-of-modules
npx bundlephobia <package-name>
```

---

## 2. كشف الاختناقات (Bottleneck Detection)

### منهجية الفحص

**الخطوة 1: قياس الأداء الحالي**
```typescript
// استخدم Performance API
performance.mark('operation-start')
// ... العملية المراد قياسها
performance.mark('operation-end')
performance.measure('operation', 'operation-start', 'operation-end')

const measure = performance.getEntriesByName('operation')[0]
console.log(`Duration: ${measure.duration}ms`)
```

**الخطوة 2: تحديد العمليات البطيئة**

استخدم React DevTools Profiler أو Chrome DevTools:
- **Long Tasks** (> 50ms) - تسبب jank
- **Excessive re-renders** - إعادة رسم غير ضرورية
- **Blocking operations** - عمليات تحجب الـ main thread

**الخطوة 3: تحليل الشبكة**
```bash
# فحص waterfall في DevTools Network tab
# ابحث عن:
# - طلبات متسلسلة يمكن توازيها
# - موارد كبيرة غير محسّنة
# - طلبات غير ضرورية
```

### أنماط الاختناقات الشائعة

| النمط | الأعراض | الحل |
|-------|---------|------|
| **N+1 Queries** | طلبات متعددة للبيانات | استخدم DataLoader أو batch requests |
| **Synchronous I/O** | تجميد الواجهة | حوّل إلى async/await |
| **Large Lists** | بطء في الـ rendering | استخدم virtualization (react-window) |
| **Unoptimized Images** | تحميل بطيء | استخدم Next.js Image أو lazy loading |
| **Excessive State Updates** | re-renders متكررة | استخدم useMemo/useCallback/memo |

### أدوات التشخيص

```typescript
// مثال: كشف re-renders غير الضرورية
import { useEffect, useRef } from 'react'

function useWhyDidYouUpdate(name: string, props: any) {
  const previousProps = useRef<any>()
  
  useEffect(() => {
    if (previousProps.current) {
      const allKeys = Object.keys({ ...previousProps.current, ...props })
      const changedProps: any = {}
      
      allKeys.forEach(key => {
        if (previousProps.current[key] !== props[key]) {
          changedProps[key] = {
            from: previousProps.current[key],
            to: props[key]
          }
        }
      })
      
      if (Object.keys(changedProps).length > 0) {
        console.log('[why-did-you-update]', name, changedProps)
      }
    }
    
    previousProps.current = props
  })
}
```

---

## 3. استراتيجيات التخزين المؤقت (Caching Strategy)

### مستويات الـ Caching

**المستوى 1: Browser Cache**
```typescript
// Next.js - إعداد headers للـ static assets
export const config = {
  headers: [
    {
      source: '/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable'
        }
      ]
    }
  ]
}
```

**المستوى 2: HTTP Cache**
```typescript
// Express - إعداد cache headers
app.get('/api/data', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
  res.json(data)
})
```

**المستوى 3: Application Cache**
```typescript
// استخدم SWR أو React Query
import useSWR from 'swr'

function useData() {
  const { data, error, isLoading } = useSWR('/api/data', fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 60000 // 1 دقيقة
  })
  
  return { data, error, isLoading }
}
```

**المستوى 4: Server-Side Cache**
```typescript
// Redis caching pattern
import { Redis } from 'ioredis'

const redis = new Redis()

async function getCachedData(key: string) {
  const cached = await redis.get(key)
  
  if (cached) {
    return JSON.parse(cached)
  }
  
  const fresh = await fetchData()
  await redis.setex(key, 300, JSON.stringify(fresh)) // 5 دقائق
  
  return fresh
}
```

### استراتيجية Cache Invalidation

```typescript
// نمط Tag-based invalidation
const CACHE_TAGS = {
  USER: 'user',
  POSTS: 'posts',
  COMMENTS: 'comments'
} as const

async function invalidateByTag(tag: string) {
  const keys = await redis.keys(`*:${tag}:*`)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

// عند تحديث بيانات المستخدم
await updateUser(userId, data)
await invalidateByTag(CACHE_TAGS.USER)
```

---

## 4. أفضل ممارسات Logging

### مستويات السجلات

```typescript
// استخدم مكتبة structured logging مثل pino
import pino from 'pino'

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
})

// المستويات بالترتيب:
logger.trace('تفاصيل دقيقة جداً')    // 10
logger.debug('معلومات debugging')    // 20
logger.info('معلومات عامة')          // 30
logger.warn('تحذيرات')               // 40
logger.error('أخطاء')                // 50
logger.fatal('أخطاء حرجة')           // 60
```

### نمط Structured Logging

```typescript
// ❌ سيء - نص غير منظم
logger.info(`User ${userId} logged in from ${ip}`)

// ✅ جيد - structured data
logger.info({
  event: 'user_login',
  userId,
  ip,
  timestamp: Date.now()
}, 'User logged in')
```

### Context Propagation

```typescript
// إضافة context لكل request
import { AsyncLocalStorage } from 'async_hooks'

const requestContext = new AsyncLocalStorage()

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID()
  
  requestContext.run({ requestId, userId: req.user?.id }, () => {
    req.log = logger.child(requestContext.getStore())
    next()
  })
})

// الآن كل log سيحتوي على requestId و userId تلقائياً
req.log.info({ action: 'fetch_data' }, 'Fetching user data')
```

### معايير الـ Logging

- [ ] **لا تسجل بيانات حساسة** (passwords, tokens, PII)
- [ ] **استخدم log levels بشكل صحيح**
- [ ] **أضف context كافي** (requestId, userId, operation)
- [ ] **سجل الأخطاء مع stack traces**
- [ ] **استخدم sampling للـ high-volume logs**

```typescript
// Sampling pattern
function shouldLog(sampleRate = 0.1): boolean {
  return Math.random() < sampleRate
}

if (shouldLog(0.01)) { // 1% من الطلبات
  logger.debug({ details: heavyData }, 'Detailed operation log')
}
```

---

## 5. إعداد Observability

### الأعمدة الثلاثة (Three Pillars)

**1. Metrics** - المقاييس
```typescript
// استخدم مكتبة مثل prom-client
import { Counter, Histogram, register } from 'prom-client'

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code']
})

const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
})

app.use((req, res, next) => {
  const start = Date.now()
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000
    
    httpRequestDuration.observe(
      { method: req.method, route: req.route?.path, status_code: res.statusCode },
      duration
    )
    
    httpRequestTotal.inc({
      method: req.method,
      route: req.route?.path,
      status_code: res.statusCode
    })
  })
  
  next()
})

// Endpoint للـ metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

**2. Logs** - السجلات
```typescript
// انظر القسم السابق عن Logging
// تأكد من:
// - Structured logging
// - Correlation IDs
// - Log aggregation (ELK, Loki, CloudWatch)
```

**3. Traces** - التتبع
```typescript
// استخدم OpenTelemetry
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express'

const provider = new NodeTracerProvider()
provider.register()

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation()
  ]
})

// الآن كل HTTP request سيتم تتبعه تلقائياً
```

### Dashboard Essentials

قم بإنشاء dashboard يعرض:

**Golden Signals:**
- **Latency** - زمن الاستجابة (p50, p95, p99)
- **Traffic** - عدد الطلبات في الثانية
- **Errors** - معدل الأخطاء (%)
- **Saturation** - استهلاك الموارد (CPU, Memory, Disk)

**Application Metrics:**
- Bundle size trends
- Page load times (FCP, LCP, TTI)
- API response times
- Cache hit rates
- Database query times

### Alerting Strategy

```yaml
# مثال: قواعد التنبيه
alerts:
  - name: HighErrorRate
    condition: error_rate > 5%
    duration: 5m
    severity: critical
    
  - name: SlowResponseTime
    condition: p95_latency > 1s
    duration: 10m
    severity: warning
    
  - name: HighMemoryUsage
    condition: memory_usage > 85%
    duration: 5m
    severity: warning
```

---

### سير العمل الكامل

عند تحليل أداء تطبيق، اتبع هذه الخطوات:

### المرحلة 1: القياس الأولي (Baseline)

```markdown
- [ ] قم بقياس bundle size الحالي
- [ ] سجل أوقات التحميل (Lighthouse/WebPageTest)
- [ ] راقب استهلاك الموارد (CPU/Memory)
- [ ] حدد أبطأ 5 عمليات
```

### المرحلة 2: التحليل

```markdown
- [ ] حلل bundle composition
- [ ] حدد الاختناقات الرئيسية
- [ ] راجع استراتيجية الـ caching
- [ ] تحقق من جودة الـ logging
- [ ] قيّم observability setup
```

### المرحلة 3: التحسين

```markdown
- [ ] طبق code splitting
- [ ] حسّن الصور والـ assets
- [ ] أضف/حسّن caching layers
- [ ] حسّن database queries
- [ ] قلل re-renders غير الضرورية
```

### المرحلة 4: التحقق

```markdown
- [ ] قس التحسينات (قبل/بعد)
- [ ] تأكد من عدم كسر الوظائف
- [ ] راقب الأداء في production
- [ ] وثّق التغييرات والنتائج
```

---

## أدوات مُوصى بها

### تحليل Bundle
- `@next/bundle-analyzer` - Next.js
- `vite-bundle-visualizer` - Vite
- `webpack-bundle-analyzer` - Webpack
- `bundlephobia.com` - فحص حجم الـ packages

### Performance Profiling
- Chrome DevTools Performance
- React DevTools Profiler
- Lighthouse CI
- WebPageTest

### Monitoring & Observability
- **Metrics**: Prometheus + Grafana
- **Logs**: ELK Stack / Loki / CloudWatch
- **Traces**: Jaeger / Zipkin / Honeycomb
- **APM**: New Relic / Datadog / Sentry

### Caching
- Redis / Memcached
- SWR / React Query
- Service Workers
- CDN (Cloudflare, Fastly)

---

## قواعد التقرير

- قس أولاً ثم حسّن — لا توصي بتحسين بدون أرقام baseline
- طبّق تحسيناً واحداً في المرة وتحقّق من أثره قبل الانتقال للتالي
- لا تكسر الوظائف في سبيل التحسين — تحقّق من `pnpm test` بعد كل تغيير
- وثّق النتائج (baseline مقابل improved)

## المراجع

- [Web Vitals](https://web.dev/vitals/) - Core Web Vitals
- [Next.js Performance](https://nextjs.org/docs/advanced-features/measuring-performance)
- [OpenTelemetry Docs](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)

---
