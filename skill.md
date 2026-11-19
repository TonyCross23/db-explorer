backend/
├── src/
│   ├── domain/                         # Core Business Logic (Framework-independent)
│   │   ├── entities/                   # Enterprise business rules / Models
│   │   │   └── user.entity.ts
│   │   ├── repositories/               # Repository Interfaces (Abstractions)
│   │   │   └── user.repository.interface.ts
│   │   └── value-objects/              # Value objects (e.g., Email, Password)
│   │
│   ├── application/                    # Use Cases / Application Business Rules
│   │   ├── use-cases/
│   │   │   ├── create-user.use-case.ts
│   │   │   └── get-user.use-case.ts
│   │   └── dtos/                       # Data Transfer Objects
│   │       ├── create-user.dto.ts
│   │       └── user-response.dto.ts
│   │
│   ├── infrastructure/                 # External Concerns (DB, Frameworks, 3rd-party APIs)
│   │   ├── database/
│   │   │   ├── prisma/ or typeorm/     # ORM Configurations, Schemas
│   │   │   └── repositories/           # Implementations of Domain Repositories
│   │   │       └── prisma-user.repository.ts
│   │   └── external-services/          # Payment gateways, Email services, etc.
│   │
│   ├── presentation/                   # Entry Points / Controllers (Adapters)
│   │   └── http/
│   │       ├── controllers/
│   │       │   └── user.controller.ts
│   │       └── filters/                # Exception filters, Interceptors
│   │
│   ├── app.module.ts                   # NestJS Root Module
│   └── main.ts                         # Application Entry Point
│
├── test/                               # E2E and Integration Tests
├── tsconfig.json
└── package.json


frontend/
├── src/
│   ├── domain/                         # Entities and Types
│   │   └── user.model.ts
│   │
│   ├── application/                    # Application Business Logic / State Management
│   │   ├── use-cases/                  # Or Pinia Actions / Composables
│   │   │   └── useUser.ts
│   │   └── stores/                     # Pinia Stores
│   │       └── user.store.ts
│   │
│   ├── infrastructure/                 # External Communications (API Clients, LocalStorage)
│   │   ├── api/                        # Axios or Fetch services
│   │   │   └── user.api.ts
│   │   └── mappers/                    # Data mappers (API DTO to Domain Model)
│   │       └── user.mapper.ts
│   │
│   ├── presentation/                   # UI Layer (Vue Components & Views)
│   │   ├── components/                 # Reusable UI components
│   │   │   └── UserCard.vue
│   │   ├── views/                      # Page views
│   │   │   └── UserProfileView.vue
│   │   └── router/                     # Vue Router setup
│   │       └── index.ts
│   │
│   ├── App.vue
│   └── main.ts
│
├── vite.config.ts
├── tsconfig.json
└── package.json


# Skill: TypeScript Validation with Zod (NestJS & Vue Clean Architecture)

## Purpose
Enforce robust, runtime-safe data validation across both frontend (Vue) and backend (NestJS) using **Zod**, adhering to Clean Architecture principles.

---

## Core Rules & Guidelines

1. **Schema-First Approach:**
   - Define all data validation schemas using Zod in a dedicated validation layer or shared package.
   - Infer TypeScript types directly from Zod schemas using `z.infer<typeof Schema>` to maintain a Single Source of Truth.

2. **Backend (NestJS) Integration:**
   - Use Zod schemas inside NestJS DTOs or create a custom Zod Validation Pipe.
   - Keep validation logic outside Domain and Infrastructure layers (handle it in Presentation or Application/DTO layers).
   - Example:
     ```typescript
     import { z } from 'zod';

     export const CreateUserSchema = z.object({
       email: z.string().email({ message: "Invalid email format" }),
       password: z.string().min(8, { message: "Password must be at least 8 characters" }),
       age: z.number().optional(),
     });

     export type CreateUserDto = z.infer<typeof CreateUserSchema>;
     ```

3. **Frontend (Vue 3) Integration:**
   - Use Zod schemas with form libraries like **VeeValidate** (`toTypedSchema`) or **TanStack Form** for reactive form validation.
   - Map API response errors back to form fields cleanly.
   - Example with VeeValidate:
     ```typescript
     import { useForm } from 'vee-validate';
     import { toTypedSchema } from '@vee-validate/zod';
     import { CreateUserSchema } from '@shared/schemas';

     const { handleSubmit, errors, defineField } = useForm({
       validationSchema: toTypedSchema(CreateUserSchema),
     });
     ```

4. **Error Handling & Messages:**
   - Always provide user-friendly, clear error messages inside Zod validation rules (e.g., `z.string().min(3, "Name is too short")`).
   - Catch `ZodError` at the presentation layer and format them into standard API error responses.

5. **Shared DTOs (Monorepo Setup):**
   - If using a Monorepo, place Zod schemas in a `shared` package so both NestJS and Vue import the exact same validation rules.
