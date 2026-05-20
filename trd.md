📘 TRD — Nota Management System
Receipt Processing + Audit Trail System

Versi: FINAL 1.1
Bahasa: Indonesia
Target: Production & AI Code Generation

1. Overview Produk
   Nota Management System adalah aplikasi berbasis web untuk:
   Input dan manajemen nota (receipt)
   Upload & processing foto nota
   Pencatatan transaksi berbasis item
   Reporting dan export data (Excel & PDF)
   Audit trail (versioning perubahan)

Sistem ini dikategorikan sebagai:
👉 Semi Accounting + Document Processing System

2. Tech Stack
   Layer Teknologi
   Frontend React + Vite
   Backend Node.js + Express (Fastify optional)
   ORM Prisma
   Database PostgreSQL (Local)
   DB Client DBeaver (optional)
   Authentication JWT
   Storage Local Storage (development)
   State Management React Query + Zustand
   UI Framework Tailwind CSS + Shadcn UI
   Automation n8n (future)
   Package Manager PNPM

3. Project Structure
   nota-system/
   ├── frontend/
   ├── backend/
   ├── prisma/
   └── package.json

4. Database Configuration (LOCAL)
   Gunakan PostgreSQL lokal.
   Nama Database:
   nota_db
   File .env backend:
   DATABASE_URL="postgresql://postgres:password@localhost:5432/nota_db"
   JWT_SECRET="your_super_secret_key"
   PORT=3000

5. Authentication System
   Flow:
   Login → validasi → generate JWT

Response:
{
"token": "jwt_token",
"user": {
"id": "uuid",
"name": "string",
"role": "admin | operator"
}
}

6. User Roles
   Role Akses
   admin Full akses
   operator Hanya tambah nota

7. Core Modules
   Authentication
   User Management
   Master Kategori
   Nota
   Reporting
   Versioning

8. Database Schema (FINAL)
   users
   id (uuid, PK)
   name
   email (unique)
   password
   role (admin/operator)
   created_at
   updated_at

people
id (uuid)
name
created_at
categories
id (uuid)
name
created_at

notes
id (uuid)
date
buyer_id (fk)
requester_id (fk)
category_id (fk)
total
image_url
created_by (fk users)
created_at
updated_at
deleted_at

note_items
id (uuid)
note_id (fk)
item_name
qty
price
subtotal

note_versions
id (uuid)
note_id (fk)
version_number
snapshot (JSONB)
updated_by
updated_at

9. Business Rules
   Total = sum(subtotal)
   Subtotal = qty × price
   Semua field wajib valid
   Operator hanya create
   Admin bisa edit/delete
   Edit = create version baru
   Soft delete (tidak boleh hard delete)

10. Backend Architecture
    backend/
    ├── src/
    │ ├── controllers/
    │ ├── services/
    │ ├── routes/
    │ ├── middlewares/
    │ └── config/
    ├── prisma/
    └── app.ts

11. API Standard
    Success
    {
    "status": "success",
    "code": 200,
    "message": "Success",
    "data": {},
    "meta": {}
    }

Error
{
"status": "error",
"code": 400,
"message": "Error message"
}

12. API Endpoints
    Auth
    POST /api/auth/login

Users
GET /api/users
POST /api/users
PATCH /api/users/:id
DELETE /api/users/:id

Categories
GET /api/categories
POST /api/categories
PATCH /api/categories/:id
DELETE /api/categories/:id

People
GET /api/people
POST /api/people

Notes
GET /api/notes
GET /api/notes/:id
POST /api/notes
PATCH /api/notes/:id
DELETE /api/notes/:id

Reports
GET /api/reports

13. Reporting
    Filter:
    tanggal
    periode (daily, weekly, monthly, yearly)
    user
    buyer
    requester

Export:
Excel
PDF

14. Frontend Architecture
    src/
    ├── components/
    │ ├── atoms/
    │ ├── molecules/
    │ ├── organisms/
    │ ├── layouts/
    │ └── views/
    ├── pages/
    ├── hooks/
    ├── services/
    └── store/

15. UI Pages
    Login
    Dashboard
    Input Nota
    List Nota
    Detail Nota
    Version History
    Master User
    Master Kategori
    Reports

16. OCR Integration (Future)
    Flow:
    Upload gambar
    Kirim ke n8n
    Return JSON
    Autofill form

17. File Upload
    JPG / PNG
    Max 5MB
    Disimpan di:
    backend/uploads/

18. Seeder
    Admin default:
    email: admin@gmail.com
    password: admin123 (bcrypt)
    role: admin

19. Quality Requirements
    TypeScript strict
    clean code
    no console.log
    modular

20. AI Code Generation Rules
    AI harus:
    generate React Vite
    generate Express backend
    generate Prisma schema
    implement JWT auth
    implement versioning
    implement reporting
    implement upload image

Semua harus:
👉 runnable
👉 clean
👉 production-ready
