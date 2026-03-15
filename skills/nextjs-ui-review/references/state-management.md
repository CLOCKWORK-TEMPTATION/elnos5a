# استراتيجيات إدارة الحالة في Next.js 15

## اختيار الحل المناسب

| نوع الحالة | الحل المناسب | حجم التطبيق | التعقيد |
|------------|--------------|-------------|---------|
| محلية في مكون واحد | `useState` | أي حجم | بسيط |
| مشتركة بين 2-3 مكونات | Props أو Context | صغير-متوسط | بسيط-متوسط |
| عامة في التطبيق | Context API | متوسط | متوسط |
| معقدة مع منطق | Zustand/Jotai | متوسط-كبير | معقد |
| بيانات من الخادم | Server Components | أي حجم | بسيط |
| Cache + Sync | React Query/SWR | متوسط-كبير | معقد |

---

## 1. useState - الحالة المحلية

### متى تستخدمه
- حالة خاصة بمكون واحد
- لا تحتاج مشاركة مع مكونات أخرى
- بسيطة وغير معقدة

### أمثلة

```typescript
'use client'

// ✅ مثال بسيط: toggle
function Accordion() {
  const [isOpen, setIsOpen] = useState(false)
  
  return (
    <div>
      <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
      {isOpen && <div>Content</div>}
    </div>
  )
}

// ✅ مثال: form state
function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  })
  
  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }
  
  return (
    <form>
      <input value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
      <input value={formData.email} onChange={(e) => handleChange('email', e.target.value)} />
      <textarea value={formData.message} onChange={(e) => handleChange('message', e.target.value)} />
    </form>
  )
}
```

---

## 2. Props Drilling - تمرير البيانات

### متى تستخدمه
- 2-3 مستويات فقط
- بيانات بسيطة
- لا يوجد تحديثات متكررة

### ✅ مقبول (2-3 مستويات)

```typescript
// ✅ صحيح: props drilling بسيط
function App() {
  const [user, setUser] = useState(null)
  return <Dashboard user={user} />
}

function Dashboard({ user }) {
  return <Profile user={user} />
}

function Profile({ user }) {
  return <div>{user.name}</div>
}
```

### ❌ غير مقبول (>3 مستويات)

```typescript
// ❌ خطأ: props drilling عميق
function App() {
  const [user, setUser] = useState(null)
  return <Layout user={user} />
}

function Layout({ user }) {
  return <Sidebar user={user} />
}

function Sidebar({ user }) {
  return <Menu user={user} />
}

function Menu({ user }) {
  return <MenuItem user={user} />
}

function MenuItem({ user }) {
  return <div>{user.name}</div> // 5 مستويات!
}

// ✅ صحيح: استخدم Context
const UserContext = createContext(null)

function App() {
  const [user, setUser] = useState(null)
  return (
    <UserContext.Provider value={user}>
      <Layout />
    </UserContext.Provider>
  )
}

function MenuItem() {
  const user = useContext(UserContext)
  return <div>{user.name}</div>
}
```

---

## 3. Context API - الحالة العامة

### متى تستخدمه
- حالة عامة في التطبيق (theme, user, language)
- تحتاج الوصول من مكونات متعددة
- لا تتغير بشكل متكرر جداً

### النمط الصحيح

```typescript
'use client'

// 1. إنشاء Context مع Type
interface ThemeContextType {
  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

// 2. Provider مع قيمة مستقرة
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  
  // ✅ استخدم useMemo لتجنب re-renders
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// 3. Hook مخصص مع error handling
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

// 4. الاستخدام
function ThemedButton() {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>
}
```

### تقسيم Contexts

```typescript
// ✅ صحيح: contexts منفصلة
const UserContext = createContext(null)
const ThemeContext = createContext(null)
const SettingsContext = createContext(null)

function App({ children }) {
  return (
    <UserProvider>
      <ThemeProvider>
        <SettingsProvider>
          {children}
        </SettingsProvider>
      </ThemeProvider>
    </UserProvider>
  )
}

// ❌ خطأ: context واحد ضخم
const AppContext = createContext({
  user: null,
  theme: 'dark',
  settings: {},
  notifications: [],
  // ... 20 خاصية
})
```

### تحسين الأداء

```typescript
// ❌ خطأ: كل المكونات تُعاد رسمها عند تغيير أي قيمة
const AppContext = createContext({ user, theme, settings })

// ✅ صحيح: فصل contexts حسب معدل التغيير
const UserContext = createContext(user) // نادراً ما يتغير
const ThemeContext = createContext(theme) // يتغير أحياناً
const NotificationsContext = createContext(notifications) // يتغير كثيراً
```

---

## 4. Zustand - إدارة حالة خفيفة

### متى تستخدمه
- حالة معقدة مع منطق
- تحتاج actions/reducers
- تريد بديل أخف من Redux

### الإعداد

```bash
pnpm add zustand
```

### مثال بسيط

```typescript
// store/useCartStore.ts
import { create } from 'zustand'

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  total: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  
  addItem: (item) => set((state) => ({
    items: [...state.items, item]
  })),
  
  removeItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id)
  })),
  
  updateQuantity: (id, quantity) => set((state) => ({
    items: state.items.map(item =>
      item.id === id ? { ...item, quantity } : item
    )
  })),
  
  total: () => {
    const { items } = get()
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }
}))

// الاستخدام
'use client'

function Cart() {
  const { items, removeItem, total } = useCartStore()
  
  return (
    <div>
      {items.map(item => (
        <div key={item.id}>
          {item.name} - ${item.price}
          <button onClick={() => removeItem(item.id)}>Remove</button>
        </div>
      ))}
      <p>Total: ${total()}</p>
    </div>
  )
}
```

### مع Persistence

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useCartStore = create(
  persist<CartStore>(
    (set, get) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      // ... rest
    }),
    {
      name: 'cart-storage', // localStorage key
    }
  )
)
```

---

## 5. Server Components - بيانات الخادم

### متى تستخدمه
- بيانات من قاعدة البيانات أو API
- لا تحتاج تفاعل
- بيانات ثابتة أو نادراً ما تتغير

### أمثلة

```typescript
// ✅ صحيح: جلب بيانات في Server Component
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

// ✅ صحيح: تمرير البيانات لـ Client Component
async function ProductPage({ id }: { id: string }) {
  const product = await db.product.findUnique({ where: { id } })
  
  return <InteractiveProductCard product={product} />
}

'use client'
function InteractiveProductCard({ product }: { product: Product }) {
  const [liked, setLiked] = useState(false)
  
  return (
    <div>
      <h2>{product.name}</h2>
      <button onClick={() => setLiked(!liked)}>
        {liked ? '❤️' : '🤍'}
      </button>
    </div>
  )
}
```

---

## 6. React Query / SWR - Cache + Sync

### متى تستخدمه
- بيانات من API تحتاج caching
- تحتاج auto-refetch
- تحتاج optimistic updates
- بيانات تتغير بشكل متكرر

### مثال مع SWR

```bash
pnpm add swr
```

```typescript
'use client'

import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

function UserProfile({ userId }: { userId: string }) {
  const { data, error, isLoading } = useSWR(`/api/users/${userId}`, fetcher, {
    refreshInterval: 3000, // auto-refetch كل 3 ثواني
    revalidateOnFocus: true, // refetch عند العودة للتبويب
  })
  
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  
  return <div>{data.name}</div>
}
```

### مثال مع React Query

```bash
pnpm add @tanstack/react-query
```

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

function TodoList() {
  const queryClient = useQueryClient()
  
  // جلب البيانات
  const { data: todos, isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: () => fetch('/api/todos').then(res => res.json())
  })
  
  // إضافة todo
  const addTodo = useMutation({
    mutationFn: (newTodo: Todo) => fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify(newTodo)
    }),
    onSuccess: () => {
      // إعادة جلب البيانات
      queryClient.invalidateQueries({ queryKey: ['todos'] })
    }
  })
  
  if (isLoading) return <div>Loading...</div>
  
  return (
    <div>
      {todos?.map(todo => <div key={todo.id}>{todo.title}</div>)}
      <button onClick={() => addTodo.mutate({ title: 'New Todo' })}>
        Add Todo
      </button>
    </div>
  )
}
```

---

## شجرة القرار

```
ما نوع البيانات؟
│
├─ بيانات من الخادم (DB/API)
│  │
│  ├─ ثابتة/نادراً ما تتغير ────────────────→ Server Components
│  │
│  └─ تتغير بشكل متكرر
│     │
│     ├─ تحتاج caching/sync ─────────────────→ React Query/SWR
│     │
│     └─ لا تحتاج caching ───────────────────→ useEffect + useState
│
└─ بيانات من العميل (UI state)
   │
   ├─ محلية في مكون واحد ───────────────────→ useState
   │
   ├─ مشتركة بين 2-3 مكونات ────────────────→ Props drilling
   │
   ├─ عامة في التطبيق (theme, user) ────────→ Context API
   │
   └─ معقدة مع منطق ──────────────────────────→ Zustand/Jotai
```

---

## الأخطاء الشائعة

### ❌ خطأ 1: استخدام useState لبيانات الخادم

```typescript
// ❌ خطأ: useState لبيانات من API
'use client'

function UserList() {
  const [users, setUsers] = useState([])
  
  useEffect(() => {
    fetch('/api/users').then(res => res.json()).then(setUsers)
  }, [])
  
  return <div>{users.map(...)}</div>
}

// ✅ صحيح: Server Component
async function UserList() {
  const users = await fetch('/api/users').then(res => res.json())
  return <div>{users.map(...)}</div>
}

// أو ✅ صحيح: React Query/SWR
'use client'

function UserList() {
  const { data: users } = useSWR('/api/users', fetcher)
  return <div>{users?.map(...)}</div>
}
```

### ❌ خطأ 2: Context ضخم

```typescript
// ❌ خطأ: context واحد لكل شيء
const AppContext = createContext({
  user: null,
  theme: 'dark',
  settings: {},
  notifications: [],
  cart: [],
  // ... 20 خاصية
})

// ✅ صحيح: contexts منفصلة
const UserContext = createContext(null)
const ThemeContext = createContext(null)
const CartContext = createContext(null)
```

### ❌ خطأ 3: Props drilling عميق

```typescript
// ❌ خطأ: 5+ مستويات
<A user={user}>
  <B user={user}>
    <C user={user}>
      <D user={user}>
        <E user={user}>
          <F user={user} /> {/* 6 مستويات! */}
        </E>
      </D>
    </C>
  </B>
</A>

// ✅ صحيح: Context
const UserContext = createContext(null)

function A() {
  const [user, setUser] = useState(null)
  return (
    <UserContext.Provider value={user}>
      <B><C><D><E><F /></E></D></C></B>
    </UserContext.Provider>
  )
}

function F() {
  const user = useContext(UserContext)
  return <div>{user.name}</div>
}
```

---

## ملخص التوصيات

| السيناريو | الحل الموصى به | البديل |
|-----------|-----------------|---------|
| UI state محلي | `useState` | - |
| مشاركة بسيطة (2-3 مستويات) | Props | Context |
| Theme/User/Language | Context API | Zustand |
| حالة معقدة مع منطق | Zustand | Redux Toolkit |
| بيانات ثابتة من API | Server Components | - |
| بيانات متغيرة من API | React Query/SWR | useEffect + useState |
| Form state بسيط | `useState` | React Hook Form |
| Form state معقد | React Hook Form | Formik |
