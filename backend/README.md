# Backend API (Express + MySQL)

## 1) Cài dependencies

```bash
npm install
```

## 2) Tạo file môi trường

Sao chép `.env.example` thành `.env` và điền đúng thông tin MySQL.

## 3) Chạy backend

```bash
npm run dev
```

Backend mặc định chạy tại `http://localhost:4000`.

## API

- `GET /api/health`
- `POST /api/auth/login`
  - body: `{ "username": "<your_username>", "password": "<your_password>" }`
