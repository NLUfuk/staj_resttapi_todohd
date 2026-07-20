// Static OpenAPI 3.0 spec for Swagger UI (/api-docs).
// Written by hand instead of JSDoc annotations scattered across route files -
// one file to keep in sync with src/routes/*.js.

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string', example: 'todo not found' } },
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    username: { type: 'string', example: 'alice' },
    role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
    created_at: { type: 'string', example: '2026-07-20 06:49:59' },
  },
};

const todoSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', example: 2 },
    title: { type: 'string', example: 'Fix printer on 3rd floor' },
    description: { type: 'string', nullable: true, example: 'Paper jam error keeps appearing' },
    status: { type: 'string', enum: ['pending', 'done'], example: 'pending' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

const adminTodoSchema = {
  allOf: [
    todoSchema,
    { type: 'object', properties: { owner_username: { type: 'string', example: 'alice' } } },
  ],
};

const ticketSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', example: 2 },
    todo_id: { type: 'integer', nullable: true, example: 2 },
    subject: { type: 'string', example: 'Printer stuck in paper jam loop' },
    message: { type: 'string', example: 'Tried reseating the tray, still shows a jam error.' },
    status: { type: 'string', enum: ['open', 'in_progress', 'closed'], example: 'open' },
    admin_response: { type: 'string', nullable: true, example: null },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

const adminTicketSchema = {
  allOf: [
    ticketSchema,
    { type: 'object', properties: { reporter_username: { type: 'string', example: 'alice' } } },
  ],
};

const authResponseSchema = {
  type: 'object',
  properties: { token: { type: 'string' }, user: userSchema },
};

const unauthorized = {
  description: 'Missing/invalid token',
  content: { 'application/json': { schema: errorSchema } },
};
const forbidden = {
  description: 'Authenticated but not an admin',
  content: { 'application/json': { schema: errorSchema } },
};
const notFound = {
  description: 'Resource not found (or not owned by the caller)',
  content: { 'application/json': { schema: errorSchema } },
};
const badRequest = {
  description: 'Validation error',
  content: { 'application/json': { schema: errorSchema } },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Todo + Helpdesk API',
    version: '1.0.0',
    description:
      'Öğrenim projesi: kullanıcılar kendi todo\'larını yönetir, istedikleri konuyu (opsiyonel bir todo\'ya bağlayarak) admine helpdesk talebi olarak gönderir. Admin, kullanıcıları, tüm todo\'ları ve helpdesk kuyruğunu yönetir.\n\n"Authorize" butonuna `/api/auth/login` ile aldığınız JWT\'yi (sadece token, `Bearer ` öneki olmadan) girerek korumalı uçları buradan deneyebilirsiniz.',
  },
  servers: [{ url: '/', description: 'Bu sunucu' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      User: userSchema,
      Todo: todoSchema,
      AdminTodo: adminTodoSchema,
      Ticket: ticketSchema,
      AdminTicket: adminTicketSchema,
      AuthResponse: authResponseSchema,
      Error: errorSchema,
    },
  },
  tags: [
    { name: 'Auth', description: 'Kayıt, giriş, oturum bilgisi' },
    { name: 'Todos', description: 'Kendi todo\'ların (CRUD)' },
    { name: 'Tickets', description: 'Kendi helpdesk taleplerin (CRUD)' },
    { name: 'Admin - Users', description: 'Kullanıcı yönetimi (admin)' },
    { name: 'Admin - Todos', description: 'Tüm todo\'lar üzerinde moderasyon (admin)' },
    { name: 'Admin - Tickets', description: 'Helpdesk kuyruğu yönetimi (admin)' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Auth'],
        summary: 'Sağlık kontrolü',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Kayıt ol (role=user olarak oluşturulur)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string', minLength: 3, example: 'newuser' },
                  password: { type: 'string', minLength: 6, example: 'password123' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Kullanıcı oluşturuldu', content: { 'application/json': { schema: authResponseSchema } } },
          400: badRequest,
          409: { description: 'Kullanıcı adı zaten alınmış', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Giriş yap',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: { username: { type: 'string' }, password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Giriş başarılı', content: { 'application/json': { schema: authResponseSchema } } },
          401: { description: 'Kullanıcı adı veya şifre hatalı', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Giriş yapmış kullanıcının bilgisi',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: userSchema } } },
          401: unauthorized,
        },
      },
    },
    '/api/todos': {
      get: {
        tags: ['Todos'],
        summary: 'Kendi todo\'larımı listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: todoSchema } } } },
          401: unauthorized,
        },
      },
      post: {
        tags: ['Todos'],
        summary: 'Yeni todo oluştur',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: { title: { type: 'string' }, description: { type: 'string', nullable: true } },
              },
            },
          },
        },
        responses: {
          201: { description: 'Oluşturuldu', content: { 'application/json': { schema: todoSchema } } },
          400: badRequest,
          401: unauthorized,
        },
      },
    },
    '/api/todos/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Todos'],
        summary: 'Tekil todo getir',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: todoSchema } } },
          401: unauthorized,
          404: notFound,
        },
      },
      put: {
        tags: ['Todos'],
        summary: 'Todo güncelle (title/description/status - hepsi opsiyonel)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  status: { type: 'string', enum: ['pending', 'done'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Güncellendi', content: { 'application/json': { schema: todoSchema } } },
          400: badRequest,
          401: unauthorized,
          404: notFound,
        },
      },
      delete: {
        tags: ['Todos'],
        summary: 'Todo sil',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Silindi' }, 401: unauthorized, 404: notFound },
      },
    },
    '/api/tickets': {
      get: {
        tags: ['Tickets'],
        summary: 'Kendi taleplerimi listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: ticketSchema } } } },
          401: unauthorized,
        },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Yeni helpdesk talebi oluştur (opsiyonel olarak kendi todo\'na bağlanır)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['subject', 'message'],
                properties: {
                  subject: { type: 'string' },
                  message: { type: 'string' },
                  todo_id: { type: 'integer', nullable: true, description: 'Sadece kendi todo\'larından biri olabilir' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Oluşturuldu', content: { 'application/json': { schema: ticketSchema } } },
          400: badRequest,
          401: unauthorized,
        },
      },
    },
    '/api/tickets/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Tickets'],
        summary: 'Tekil talep getir',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: ticketSchema } } },
          401: unauthorized,
          404: notFound,
        },
      },
      put: {
        tags: ['Tickets'],
        summary: 'Talebi düzenle (sadece status=open iken; sahibi tarafından)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { subject: { type: 'string' }, message: { type: 'string' } } },
            },
          },
        },
        responses: {
          200: { description: 'Güncellendi', content: { 'application/json': { schema: ticketSchema } } },
          400: badRequest,
          401: unauthorized,
          404: notFound,
          409: { description: 'Talep artık open durumunda değil', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      delete: {
        tags: ['Tickets'],
        summary: 'Talebi sil',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Silindi' }, 401: unauthorized, 404: notFound },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin - Users'],
        summary: 'Tüm kullanıcıları listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: userSchema } } } },
          401: unauthorized,
          403: forbidden,
        },
      },
    },
    '/api/admin/users/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin - Users'],
        summary: 'Tekil kullanıcı getir',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: userSchema } } },
          401: unauthorized,
          403: forbidden,
          404: notFound,
        },
      },
      patch: {
        tags: ['Admin - Users'],
        summary: 'Kullanıcının rolünü değiştir (promote/demote)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['role'],
                properties: { role: { type: 'string', enum: ['user', 'admin'] } },
              },
            },
          },
        },
        responses: {
          200: { description: 'Güncellendi', content: { 'application/json': { schema: userSchema } } },
          400: badRequest,
          401: unauthorized,
          403: forbidden,
          404: notFound,
        },
      },
      delete: {
        tags: ['Admin - Users'],
        summary: 'Kullanıcıyı sil (kendi hesabını silemezsin)',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Silindi' },
          400: { description: 'Kendi hesabını silemezsin', content: { 'application/json': { schema: errorSchema } } },
          401: unauthorized,
          403: forbidden,
          404: notFound,
        },
      },
    },
    '/api/admin/todos': {
      get: {
        tags: ['Admin - Todos'],
        summary: 'Tüm kullanıcıların todo\'larını listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: adminTodoSchema } } } },
          401: unauthorized,
          403: forbidden,
        },
      },
    },
    '/api/admin/todos/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      delete: {
        tags: ['Admin - Todos'],
        summary: 'Herhangi bir kullanıcının todo\'sunu sil (moderasyon)',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Silindi' }, 401: unauthorized, 403: forbidden, 404: notFound },
      },
    },
    '/api/admin/tickets': {
      get: {
        tags: ['Admin - Tickets'],
        summary: 'Tüm helpdesk taleplerini listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: adminTicketSchema } } } },
          401: unauthorized,
          403: forbidden,
        },
      },
    },
    '/api/admin/tickets/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Admin - Tickets'],
        summary: 'Tekil talep getir',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: adminTicketSchema } } },
          401: unauthorized,
          403: forbidden,
          404: notFound,
        },
      },
      patch: {
        tags: ['Admin - Tickets'],
        summary: 'Talebin durumunu ve/veya admin yanıtını güncelle',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['open', 'in_progress', 'closed'] },
                  admin_response: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Güncellendi', content: { 'application/json': { schema: ticketSchema } } },
          400: badRequest,
          401: unauthorized,
          403: forbidden,
          404: notFound,
        },
      },
      delete: {
        tags: ['Admin - Tickets'],
        summary: 'Talebi sil',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'Silindi' }, 401: unauthorized, 403: forbidden, 404: notFound },
      },
    },
  },
};
