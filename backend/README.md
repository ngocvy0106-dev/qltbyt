# Backend API (Express + MySQL)

## 1) Cài dependencies

```bash
npm install
```

## 2) Tạo file môi trường

Sao chép `.env.example` thành `.env` và điền đúng thông tin MySQL.

### Kết nối TiDB Cloud

Điền các biến trong `.env` như sau:

```env
DB_HOST=<host TiDB>
DB_PORT=3306
DB_NAME=<database name>
DB_USER=<user>
DB_PASSWORD=<password>
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

Lưu ý:

- Nếu project cũ đang dùng `DB_PASS`, backend vẫn tương thích, nhưng nên đổi sang `DB_PASSWORD` để đồng bộ.
- Nếu đang test local không SSL, có thể đặt `DB_SSL=false`.

## 3) Chạy backend

```bash
npm run dev
```

Backend mặc định chạy tại `http://localhost:4000`.

## API

- `GET /api/health`
- `POST /api/auth/login`
  - body: `{ "username": "<your_username>", "password": "<your_password>" }`
