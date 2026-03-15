# أنماط الخطافات (Hooks Patterns)

## القواعد الأساسية

1. **فقط في Client Components** - الخطافات تعمل فقط في مكونات بها `'use client'`
2. **في أعلى المكون** - لا تستدعي داخل شروط، حلقات، أو دوال متداخلة
3. **التسمية** - الخطافات المخصصة تبدأ بـ `use`
4. **Dependencies** - حدد dependencies بدقة في useEffect/useMemo/useCallback

---

## useState

### الاستخدام الأساسي

```typescript
'use client'

function Counter() {
  const [count, setCount] = useState(0)
  
  return (
    <div>
      <p>{count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
    </div>
  )
}
```

### ✅ أنماط صحيحة

**1. Lazy initialization للحسابات الثقيلة**
```typescript
// ✅ صحيح: دالة تُستدعى مرة واحدة فقط
const [state, setState] = useState(() => {
  const initialState = expensiveComputation()
  return initialState
})

// ❌ خطأ: الحساب يتكرر في كل render
const [state, setState] = useState(expensiveComputation())
```

**2. Functional updates للتحديثات المتتالية**
```typescript
// ✅ صحيح: استخدم دالة للتحديث
setCount(prevCount => prevCount + 1)

// ❌ خطأ: قد يسبب مشاكل في التحديثات المتتالية
setCount(count + 1)
```

**3. تجنب useState للبيانات المحسوبة**
```typescript
// ❌ خطأ: استخدام state لبيانات يمكن حسابها
const [fullName, setFullName] = useState('')

useEffect(() => {
  setFullName(`${firstName} ${lastName}`)
}, [firstName, lastName])

// ✅ صحيح: احسبها مباشرة
const fullName = `${firstName} ${lastName}`
```

---

## useEffect

### الاستخدام الأساسي

```typescript
'use client'

function DataFetcher({ userId }: { userId: string }) {
  const [data, setData] = useState(null)
  
  useEffect(() => {
    fetchUser(userId).then(setData)
  }, [userId]) // ✅ dependencies صحيحة
  
  return <div>{data?.name}</div>
}
```

### ✅ أنماط صحيحة

**1. Cleanup للاشتراكات**
```typescript
useEffect(() => {
  const subscription = api.subscribe(data => {
    setData(data)
  })
  
  // ✅ cleanup function
  return () => {
    subscription.unsubscribe()
  }
}, [])
```

**2. تجنب الحلقات اللانهائية**
```typescript
// ❌ خطأ: حلقة لا نهائية
useEffect(() => {
  setCount(count + 1) // يسبب re-render → useEffect يُستدعى مجدداً
}, [count])

// ✅ صحيح: حدد متى تريد التحديث
useEffect(() => {
  if (shouldUpdate) {
    setCount(count + 1)
  }
}, [shouldUpdate])
```

**3. Dependencies كاملة**
```typescript
// ❌ خطأ: dependencies ناقصة
useEffect(() => {
  fetchData(userId, filter)
}, [userId]) // ❌ filter مفقود

// ✅ صحيح: جميع dependencies موجودة
useEffect(() => {
  fetchData(userId, filter)
}, [userId, filter])
```

**4. تجنب useEffect للحسابات**
```typescript
// ❌ خطأ: استخدام useEffect لحساب قيمة
const [total, setTotal] = useState(0)

useEffect(() => {
  setTotal(items.reduce((sum, item) => sum + item.price, 0))
}, [items])

// ✅ صحيح: احسبها مباشرة أو استخدم useMemo
const total = items.reduce((sum, item) => sum + item.price, 0)
```

---

## useMemo

### متى تستخدمه

**✅ استخدم useMemo لـ:**
- حسابات ثقيلة ومعقدة
- إنشاء كائنات/مصفوفات تُمرر كـ dependencies
- تحسين أداء قوائم كبيرة

**❌ لا تستخدم useMemo لـ:**
- حسابات بسيطة (أسرع بدونه)
- كل شيء (over-optimization)

### أمثلة

```typescript
// ✅ صحيح: حساب ثقيل
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.price - b.price)
}, [items])

// ✅ صحيح: كائن يُمرر كـ dependency
const config = useMemo(() => ({
  userId,
  theme,
  settings
}), [userId, theme, settings])

// ❌ خطأ: حساب بسيط لا يحتاج useMemo
const doubled = useMemo(() => count * 2, [count])

// ✅ صحيح: احسبها مباشرة
const doubled = count * 2
```

---

## useCallback

### متى تستخدمه

**✅ استخدم useCallback لـ:**
- دوال تُمرر كـ props لمكونات محسّنة (memo)
- دوال في dependencies لـ useEffect/useMemo
- event handlers في قوائم كبيرة

### أمثلة

```typescript
// ✅ صحيح: دالة تُمرر لمكون محسّن
const MemoizedChild = memo(Child)

function Parent() {
  const handleClick = useCallback(() => {
    console.log('clicked')
  }, [])
  
  return <MemoizedChild onClick={handleClick} />
}

// ✅ صحيح: دالة في dependencies
const fetchData = useCallback(() => {
  return api.get(`/users/${userId}`)
}, [userId])

useEffect(() => {
  fetchData()
}, [fetchData])

// ❌ خطأ: useCallback بلا داعٍ
function Parent() {
  const handleClick = useCallback(() => {
    console.log('clicked')
  }, [])
  
  return <div onClick={handleClick}>Click</div> // ❌ لا حاجة
}

// ✅ صحيح: دالة عادية
function Parent() {
  const handleClick = () => console.log('clicked')
  return <div onClick={handleClick}>Click</div>
}
```

---

## useContext

### الاستخدام الأساسي

```typescript
// context.tsx
'use client'

const ThemeContext = createContext<Theme | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  
  const value = useMemo(() => ({ theme, setTheme }), [theme])
  
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

// component.tsx
'use client'

function ThemedButton() {
  const { theme, setTheme } = useTheme()
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>
}
```

### ✅ أنماط صحيحة

**1. قيمة مستقرة لتجنب re-renders**
```typescript
// ✅ صحيح: استخدم useMemo
const value = useMemo(() => ({ theme, setTheme }), [theme])

// ❌ خطأ: كائن جديد في كل render
const value = { theme, setTheme }
```

**2. تقسيم Context حسب المسؤولية**
```typescript
// ✅ صحيح: contexts منفصلة
const UserContext = createContext(null)
const ThemeContext = createContext(null)
const SettingsContext = createContext(null)

// ❌ خطأ: context واحد ضخم
const AppContext = createContext({
  user: null,
  theme: 'dark',
  settings: {},
  notifications: []
})
```

---

## الخطافات المخصصة (Custom Hooks)

### القواعد

1. **التسمية:** تبدأ بـ `use`
2. **إعادة الاستخدام:** استخرج منطق مشترك
3. **التركيب:** يمكن أن تستخدم خطافات أخرى

### أمثلة شائعة

**1. useDebounce**
```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  
  return debouncedValue
}

// الاستخدام
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

**2. useLocalStorage**
```typescript
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })
  
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.error(error)
    }
  }
  
  return [storedValue, setValue] as const
}

// الاستخدام
function Settings() {
  const [theme, setTheme] = useLocalStorage('theme', 'dark')
  return <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>
}
```

**3. useMediaQuery**
```typescript
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  
  useEffect(() => {
    const media = window.matchMedia(query)
    setMatches(media.matches)
    
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches)
    media.addEventListener('change', listener)
    
    return () => media.removeEventListener('change', listener)
  }, [query])
  
  return matches
}

// الاستخدام
function ResponsiveComponent() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  return <div>{isMobile ? 'Mobile' : 'Desktop'}</div>
}
```

**4. useFetch**
```typescript
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  
  useEffect(() => {
    let cancelled = false
    
    setLoading(true)
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setData(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err)
          setLoading(false)
        }
      })
    
    return () => {
      cancelled = true
    }
  }, [url])
  
  return { data, loading, error }
}

// الاستخدام
function UserProfile({ userId }: { userId: string }) {
  const { data, loading, error } = useFetch<User>(`/api/users/${userId}`)
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <div>{data?.name}</div>
}
```

---

## الأخطاء الشائعة

### ❌ خطأ 1: استدعاء Hooks بشكل شرطي

```typescript
// ❌ خطأ
function Component({ condition }) {
  if (condition) {
    const [state, setState] = useState(0) // ❌ خطأ
  }
}

// ✅ صحيح
function Component({ condition }) {
  const [state, setState] = useState(0)
  
  if (condition) {
    // استخدم state هنا
  }
}
```

### ❌ خطأ 2: dependencies ناقصة

```typescript
// ❌ خطأ
useEffect(() => {
  fetchData(userId, filter)
}, [userId]) // ❌ filter مفقود

// ✅ صحيح
useEffect(() => {
  fetchData(userId, filter)
}, [userId, filter])
```

### ❌ خطأ 3: استخدام Hooks في Server Components

```typescript
// ❌ خطأ: Server Component لا يمكن استخدام hooks
async function ServerComponent() {
  const [state, setState] = useState(0) // ❌ خطأ
  return <div>{state}</div>
}

// ✅ صحيح: أضف 'use client'
'use client'

function ClientComponent() {
  const [state, setState] = useState(0)
  return <div>{state}</div>
}
```
