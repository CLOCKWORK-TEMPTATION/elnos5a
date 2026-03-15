# أنماط Server Components vs Client Components

## القاعدة الأساسية

**افتراضي:** كل مكون في Next.js 15 هو Server Component ما لم تضف `'use client'`

## متى تستخدم Server Components

### ✅ حالات الاستخدام المثالية:

1. **جلب البيانات من قاعدة البيانات أو API**
```typescript
// ✅ Server Component
async function UserProfile({ userId }: { userId: string }) {
  const user = await db.user.findUnique({ where: { id: userId } })
  return <div>{user.name}</div>
}
```

2. **الوصول المباشر للموارد الخلفية**
```typescript
// ✅ Server Component
async function ConfigPanel() {
  const config = await fs.readFile('config.json', 'utf-8')
  return <pre>{config}</pre>
}
```

3. **المكونات الثابتة بدون تفاعل**
```typescript
// ✅ Server Component
function Header() {
  return <header><h1>Welcome</h1></header>
}
```

4. **استخدام المكتبات الكبيرة على الخادم فقط**
```typescript
// ✅ Server Component - المكتبة لا تُرسل للعميل
import { marked } from 'marked'

async function BlogPost({ slug }: { slug: string }) {
  const post = await getPost(slug)
  const html = marked(post.content)
  return <article dangerouslySetInnerHTML={{ __html: html }} />
}
```

### ❌ لا تستخدم Server Components لـ:

- التفاعل (onClick, onChange, onSubmit)
- Hooks (useState, useEffect, useContext)
- Browser APIs (window, localStorage, document)
- Event listeners
- Class components

---

## متى تستخدم Client Components

### ✅ حالات الاستخدام المثالية:

1. **التفاعل مع المستخدم**
```typescript
// ✅ Client Component
'use client'

function Counter() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>{count}</button>
}
```

2. **استخدام Hooks**
```typescript
// ✅ Client Component
'use client'

function SearchBox() {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  
  useEffect(() => {
    if (debouncedQuery) {
      searchAPI(debouncedQuery)
    }
  }, [debouncedQuery])
  
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />
}
```

3. **Browser APIs**
```typescript
// ✅ Client Component
'use client'

function ThemeToggle() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })
  
  const toggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
  }
  
  return <button onClick={toggle}>Toggle Theme</button>
}
```

4. **Event Listeners**
```typescript
// ✅ Client Component
'use client'

function ScrollProgress() {
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = (window.scrollY / document.body.scrollHeight) * 100
      setProgress(scrolled)
    }
    
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
  
  return <div className="progress-bar" style={{ width: `${progress}%` }} />
}
```

---

## الأنماط المتقدمة

### 1. تركيب Server + Client Components

**النمط:** Server Component يحتوي على Client Component

```typescript
// app/page.tsx - Server Component
async function HomePage() {
  const posts = await fetchPosts() // ✅ جلب على الخادم
  
  return (
    <div>
      <h1>Blog Posts</h1>
      {posts.map(post => (
        <PostCard key={post.id} post={post} /> // ✅ Client Component
      ))}
    </div>
  )
}

// components/PostCard.tsx - Client Component
'use client'

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false)
  
  return (
    <article>
      <h2>{post.title}</h2>
      <button onClick={() => setLiked(!liked)}>
        {liked ? '❤️' : '🤍'}
      </button>
    </article>
  )
}
```

### 2. تمرير Server Components كـ children

**النمط:** Client Component يستقبل Server Component كـ children

```typescript
// components/ClientWrapper.tsx - Client Component
'use client'

function ClientWrapper({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && children} {/* ✅ children يمكن أن يكون Server Component */}
    </div>
  )
}

// app/page.tsx - Server Component
async function Page() {
  const data = await fetchData() // ✅ جلب على الخادم
  
  return (
    <ClientWrapper>
      <ServerContent data={data} /> {/* ✅ Server Component */}
    </ClientWrapper>
  )
}
```

### 3. Shared Components (مكونات مشتركة)

**النمط:** مكونات تعمل في كلا السياقين

```typescript
// components/Badge.tsx - لا 'use client' ولا hooks
interface BadgeProps {
  variant: 'success' | 'error' | 'warning'
  children: ReactNode
}

function Badge({ variant, children }: BadgeProps) {
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500'
  }
  
  return <span className={colors[variant]}>{children}</span>
}

// ✅ يمكن استخدامه في Server Component
async function ServerPage() {
  return <Badge variant="success">Done</Badge>
}

// ✅ يمكن استخدامه في Client Component
'use client'
function ClientPage() {
  return <Badge variant="error">Error</Badge>
}
```

---

## الأخطاء الشائعة

### ❌ خطأ 1: 'use client' في كل مكون

```typescript
// ❌ خطأ: لا حاجة لـ 'use client' هنا
'use client'

function StaticHeader() {
  return <header>Welcome</header>
}

// ✅ صحيح: احذف 'use client'
function StaticHeader() {
  return <header>Welcome</header>
}
```

### ❌ خطأ 2: استخدام async في Client Component

```typescript
// ❌ خطأ: async لا يعمل في Client Components
'use client'

async function UserList() {
  const users = await fetchUsers() // ❌ خطأ
  return <div>{users.map(...)}</div>
}

// ✅ صحيح: استخدم useEffect أو Server Component
'use client'

function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    fetchUsers().then(setUsers)
  }, [])
  
  return <div>{users.map(...)}</div>
}
```

### ❌ خطأ 3: تمرير دوال غير قابلة للتسلسل

```typescript
// ❌ خطأ: لا يمكن تمرير دوال من Server → Client
// app/page.tsx - Server Component
function Page() {
  const handleClick = () => console.log('clicked') // ❌ دالة غير قابلة للتسلسل
  
  return <ClientButton onClick={handleClick} /> // ❌ خطأ
}

// ✅ صحيح: عرّف الدالة في Client Component
'use client'

function ClientButton() {
  const handleClick = () => console.log('clicked') // ✅ صحيح
  return <button onClick={handleClick}>Click</button>
}
```

### ❌ خطأ 4: استيراد Client Component في Server Component بشكل خاطئ

```typescript
// ❌ خطأ: استيراد مباشر يمنع tree-shaking
import ClientComponent from './ClientComponent' // قد يسبب مشاكل

// ✅ صحيح: استخدم dynamic import للمكونات الثقيلة
import dynamic from 'next/dynamic'

const ClientComponent = dynamic(() => import('./ClientComponent'), {
  ssr: false // إن كان يستخدم browser APIs
})
```

---

## قرار سريع: Server أم Client؟

```
هل المكون يحتاج:
├─ تفاعل (onClick, onChange)? ────────────────────→ Client
├─ Hooks (useState, useEffect, useContext)? ───────→ Client
├─ Browser APIs (window, localStorage)? ───────────→ Client
├─ Event listeners? ───────────────────────────────→ Client
├─ جلب بيانات من DB/API مباشرة? ─────────────────→ Server
├─ استخدام مكتبات Node.js (fs, path)? ───────────→ Server
├─ مكون ثابت بدون تفاعل? ────────────────────────→ Server
└─ عرض بيانات فقط? ───────────────────────────────→ Server
```

---

## نصائح الأداء

1. **ادفع 'use client' للأسفل قدر الإمكان**
   - بدلاً من جعل الصفحة كاملة Client Component، اجعل فقط الأجزاء التفاعلية

2. **استخدم Server Components للبيانات الثقيلة**
   - جلب البيانات على الخادم يقلل حجم JavaScript المرسل للعميل

3. **تجنب props drilling بين Server/Client**
   - استخدم Context في Client Components فقط
   - مرر البيانات مباشرة من Server Component

4. **استخدم Suspense مع Server Components**
```typescript
// ✅ صحيح: Suspense مع Server Component
<Suspense fallback={<Loading />}>
  <AsyncServerComponent />
</Suspense>
```
