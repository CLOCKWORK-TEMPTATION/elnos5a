# معايير مراجعة API - التفاصيل الكاملة

## 1. معايير Routes Layer

### المسؤوليات المسموحة
- تعريف HTTP methods وpaths
- ربط middleware (auth, validation, rate limiting)
- توجيه الطلب للـ controller المناسب
- Validation أولية باستخدام schemas

### المسؤوليات الممنوعة
- ❌ Business logic
- ❌ Database queries مباشرة
- ❌ معالجة بيانات معقدة
- ❌ استدعاء external APIs

### مثال مثالي
```typescript
// routes/user.routes.ts
import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { validateRequest } from '../middleware/validation';
import { authenticate } from '../middleware/auth';
import { createUserSchema, updateUserSchema } from '../schemas/user.schema';

const router = Router();

// ✅ Route نظيف: فقط routing + middleware
router.post(
  '/users',
  validateRequest(createUserSchema),
  userController.createUser
);

router.get(
  '/users/:id',
  authenticate,
  userController.getUser
);

router.patch(
  '/users/:id',
  authenticate,
  validateRequest(updateUserSchema),
  userController.updateUser
);

router.delete(
  '/users/:id',
  authenticate,
  userController.deleteUser
);

export default router;
```

---

## 2. معايير Controllers Layer

### المسؤوليات المسموحة
- استقبال الطلب (req) وإرسال الاستجابة (res)
- استخراج البيانات من req (body, params, query)
- استدعاء services المناسبة
- تنسيق الاستجابة (status codes, response format)
- معالجة الأخطاء وتمريرها للـ error handler

### المسؤوليات الممنوعة
- ❌ Business logic معقد
- ❌ Database queries مباشرة
- ❌ Data transformation معقد
- ❌ استدعاء external APIs مباشرة

### مثال مثالي
```typescript
// controllers/user.controller.ts
import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/user.service';
import { CreateUserDTO, UpdateUserDTO } from '../types/user.types';

export class UserController {
  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      // استخراج البيانات المُتحقق منها
      const userData: CreateUserDTO = req.validatedBody;
      
      // استدعاء service
      const user = await userService.createUser(userData);
      
      // تنسيق الاستجابة
      res.status(201).json({
        success: true,
        data: user,
        message: 'User created successfully'
      });
    } catch (error) {
      // تمرير الخطأ للـ error handler
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const user = await userService.getUserById(userId);
      
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      const updateData: UpdateUserDTO = req.validatedBody;
      
      const updatedUser = await userService.updateUser(userId, updateData);
      
      res.status(200).json({
        success: true,
        data: updatedUser,
        message: 'User updated successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.params.id;
      await userService.deleteUser(userId);
      
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
```

---

## 3. معايير Services Layer

### المسؤوليات المسموحة
- Business logic الكامل
- تنسيق العمليات بين repositories مختلفة
- Data transformation وvalidation إضافية
- استدعاء external services
- Transaction management
- Caching logic

### المسؤوليات الممنوعة
- ❌ HTTP-specific logic (req, res)
- ❌ Database queries مباشرة (استخدم repositories)
- ❌ معرفة تفاصيل HTTP status codes

### مثال مثالي
```typescript
// services/user.service.ts
import { UserRepository } from '../repositories/user.repository';
import { EmailService } from './email.service';
import { CacheService } from './cache.service';
import { CreateUserDTO, UpdateUserDTO, UserResponse } from '../types/user.types';
import { hashPassword, sanitizeUser } from '../utils/user.utils';
import { AppError } from '../utils/errors';

export class UserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService,
    private cacheService: CacheService
  ) {}

  async createUser(userData: CreateUserDTO): Promise<UserResponse> {
    // Business logic: التحقق من عدم وجود المستخدم
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new AppError('User already exists', 409);
    }

    // Business logic: تشفير كلمة المرور
    const hashedPassword = await hashPassword(userData.password);

    // إنشاء المستخدم
    const user = await this.userRepository.create({
      ...userData,
      password: hashedPassword
    });

    // Business logic: إرسال بريد ترحيبي
    await this.emailService.sendWelcomeEmail(user.email, user.name);

    // Business logic: تنظيف البيانات الحساسة
    return sanitizeUser(user);
  }

  async getUserById(userId: string): Promise<UserResponse> {
    // محاولة الحصول من cache أولاً
    const cachedUser = await this.cacheService.get(`user:${userId}`);
    if (cachedUser) {
      return cachedUser;
    }

    // الحصول من database
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const sanitizedUser = sanitizeUser(user);

    // حفظ في cache
    await this.cacheService.set(`user:${userId}`, sanitizedUser, 3600);

    return sanitizedUser;
  }

  async updateUser(userId: string, updateData: UpdateUserDTO): Promise<UserResponse> {
    // التحقق من وجود المستخدم
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Business logic: إذا تم تغيير البريد، تحقق من عدم وجوده
    if (updateData.email && updateData.email !== user.email) {
      const existingUser = await this.userRepository.findByEmail(updateData.email);
      if (existingUser) {
        throw new AppError('Email already in use', 409);
      }
    }

    // Business logic: إذا تم تغيير كلمة المرور، شفّرها
    if (updateData.password) {
      updateData.password = await hashPassword(updateData.password);
    }

    // تحديث المستخدم
    const updatedUser = await this.userRepository.update(userId, updateData);

    // مسح cache
    await this.cacheService.delete(`user:${userId}`);

    return sanitizeUser(updatedUser);
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Business logic: حذف البيانات المرتبطة
    await this.userRepository.delete(userId);

    // مسح cache
    await this.cacheService.delete(`user:${userId}`);

    // Business logic: إرسال بريد وداع
    await this.emailService.sendGoodbyeEmail(user.email, user.name);
  }
}

export const userService = new UserService(
  new UserRepository(),
  new EmailService(),
  new CacheService()
);
```

---

## 4. معايير Input Validation

### استخدام Zod (مثال)
```typescript
// schemas/user.schema.ts
import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    name: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must not exceed 100 characters'),
    
    email: z.string()
      .email('Invalid email format')
      .toLowerCase(),
    
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    
    age: z.number()
      .int('Age must be an integer')
      .min(18, 'Must be at least 18 years old')
      .max(120, 'Invalid age')
      .optional(),
    
    role: z.enum(['user', 'admin', 'moderator'])
      .default('user')
  })
});

export const updateUserSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().toLowerCase().optional(),
    password: z.string().min(8).optional(),
    age: z.number().int().min(18).max(120).optional()
  }).refine(
    data => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' }
  )
});
```

### Validation Middleware
```typescript
// middleware/validation.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../utils/errors';

export const validateRequest = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      });
      
      // حفظ البيانات المُتحقق منها
      req.validatedBody = validated.body;
      req.validatedQuery = validated.query;
      req.validatedParams = validated.params;
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        next(new AppError('Validation failed', 400, errors));
      } else {
        next(error);
      }
    }
  };
};
```

---

## 5. معايير Error Handling

### Custom Error Classes
```typescript
// utils/errors.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errors?: any[]
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, errors?: any[]) {
    super(message, 400, errors);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
  }
}
```

### Global Error Handler
```typescript
// middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log الخطأ
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // إذا كان AppError مخصص
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }

  // أخطاء غير متوقعة
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
```

---

## 6. معايير الأمان

### Authentication Middleware
```typescript
// middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors';

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // استخراج token من header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);

    // التحقق من token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // حفظ معلومات المستخدم في request
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
};
```

### Authorization Middleware
```typescript
// middleware/authorize.ts
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors';

export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ForbiddenError('User not authenticated'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

// الاستخدام:
// router.delete('/users/:id', authenticate, authorize('admin'), userController.deleteUser);
```

### Rate Limiting
```typescript
// middleware/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // 100 طلب كحد أقصى
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 محاولات تسجيل دخول فقط
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true
});
```

---

## 7. معايير الأداء

### Pagination
```typescript
// utils/pagination.ts
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const paginate = <T>(
  data: T[],
  total: number,
  params: Required<PaginationParams>
): PaginatedResponse<T> => {
  const totalPages = Math.ceil(total / params.limit);
  
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1
    }
  };
};
```

### Caching Strategy
```typescript
// services/cache.service.ts
import Redis from 'ioredis';

export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

---

## 8. معايير Testing

### Controller Tests
```typescript
// tests/controllers/user.controller.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserController } from '../../controllers/user.controller';
import { userService } from '../../services/user.service';

vi.mock('../../services/user.service');

describe('UserController', () => {
  let controller: UserController;
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    controller = new UserController();
    mockReq = { validatedBody: {}, params: {}, user: {} };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn()
    };
    mockNext = vi.fn();
  });

  describe('createUser', () => {
    it('should create user and return 201', async () => {
      const userData = { name: 'Test', email: 'test@test.com' };
      const createdUser = { id: '1', ...userData };
      
      mockReq.validatedBody = userData;
      vi.mocked(userService.createUser).mockResolvedValue(createdUser);

      await controller.createUser(mockReq, mockRes, mockNext);

      expect(userService.createUser).toHaveBeenCalledWith(userData);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: createdUser,
        message: 'User created successfully'
      });
    });

    it('should call next with error on failure', async () => {
      const error = new Error('Service error');
      vi.mocked(userService.createUser).mockRejectedValue(error);

      await controller.createUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
```

### Service Tests
```typescript
// tests/services/user.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../services/user.service';
import { UserRepository } from '../../repositories/user.repository';
import { AppError } from '../../utils/errors';

vi.mock('../../repositories/user.repository');

describe('UserService', () => {
  let service: UserService;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = new UserRepository();
    service = new UserService(mockRepository, {} as any, {} as any);
  });

  describe('createUser', () => {
    it('should throw error if user already exists', async () => {
      const userData = { email: 'test@test.com', password: 'pass123' };
      vi.mocked(mockRepository.findByEmail).mockResolvedValue({ id: '1' });

      await expect(service.createUser(userData)).rejects.toThrow(AppError);
      await expect(service.createUser(userData)).rejects.toThrow('User already exists');
    });

    it('should create user successfully', async () => {
      const userData = { email: 'test@test.com', password: 'pass123', name: 'Test' };
      vi.mocked(mockRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockRepository.create).mockResolvedValue({ id: '1', ...userData });

      const result = await service.createUser(userData);

      expect(result).toHaveProperty('id');
      expect(result).not.toHaveProperty('password');
    });
  });
});
```
