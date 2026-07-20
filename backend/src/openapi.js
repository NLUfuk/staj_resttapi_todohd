// Static OpenAPI 3.0 spec for Swagger UI (/api-docs).
// Written by hand instead of JSDoc annotations scattered across route files -
// one file to keep in sync with src/routes/*.js.

const errorSchema = {
  type: 'object',
  properties: { error: { type: 'string', example: 'todo not found' } },
};

const departmentSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    name: { type: 'string', example: 'Donanım' },
    slug: { type: 'string', example: 'donanim' },
    created_at: { type: 'string' },
  },
};

const channelSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    department_id: { type: 'integer', nullable: true, example: 1, description: 'NULL = herkese açık (#genel)' },
    name: { type: 'string', example: 'donanim' },
    created_at: { type: 'string' },
  },
};

const messageSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    channel_id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', example: 2 },
    username: { type: 'string', example: 'alice' },
    body: { type: 'string', example: 'Merhaba herkese' },
    created_at: { type: 'string' },
  },
};

const notificationSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', example: 2 },
    type: { type: 'string', enum: ['ticket_comment', 'ticket_status', 'mention'], example: 'ticket_comment' },
    ref_id: { type: 'integer', nullable: true, example: 5, description: 'İlgili kaynağın id\'si (ticket, message, ...)' },
    body: { type: 'string', example: '"Printer stuck" talebinize yeni bir yorum geldi' },
    read_at: { type: 'string', nullable: true, example: null },
    created_at: { type: 'string' },
  },
};

const auditLogSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', nullable: true, example: 1, description: 'Aksiyonu yapan admin; kullanıcı silindiyse NULL' },
    actor_username: { type: 'string', nullable: true, example: 'admin' },
    action: { type: 'string', example: 'ticket.close' },
    target: { type: 'string', nullable: true, example: 'tickets:5' },
    created_at: { type: 'string' },
  },
};

const userSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    username: { type: 'string', example: 'alice' },
    role: { type: 'string', enum: ['user', 'dept_lead', 'admin'], example: 'user' },
    department_id: { type: 'integer', nullable: true, example: 1 },
    created_at: { type: 'string', example: '2026-07-20 06:49:59' },
  },
};

const statsSchema = {
  type: 'object',
  properties: {
    ticketsByDepartment: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          department: { type: 'string', example: 'donanim' },
          open: { type: 'integer', example: 3 },
          in_progress: { type: 'integer', example: 1 },
          closed: { type: 'integer', example: 5 },
        },
      },
    },
    avgTicketClosureHours: { type: 'number', nullable: true, example: 12.4, description: 'Kapatılmış talep yoksa null' },
    todosPerUser: {
      type: 'array',
      items: {
        type: 'object',
        properties: { username: { type: 'string', example: 'alice' }, todo_count: { type: 'integer', example: 4 } },
      },
    },
    messageVolumeLast7Days: {
      type: 'array',
      items: {
        type: 'object',
        properties: { channel: { type: 'string', example: 'genel' }, message_count: { type: 'integer', example: 20 } },
      },
    },
    totalMessagesLast7Days: { type: 'integer', example: 45 },
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
    due_date: { type: 'string', nullable: true, example: '2026-08-01' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'], example: 'medium' },
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
    department_id: { type: 'integer', example: 1 },
    subject: { type: 'string', example: 'Printer stuck in paper jam loop' },
    message: { type: 'string', example: 'Tried reseating the tray, still shows a jam error.' },
    status: { type: 'string', enum: ['open', 'in_progress', 'closed'], example: 'open' },
    admin_response: {
      type: 'string',
      nullable: true,
      example: null,
      deprecated: true,
      description: 'Kullanımdan kaldırıldı - yerine /api/tickets/{id}/comments kullanın (konuşma akışı, tek alan yerine).',
    },
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

const ticketCommentSchema = {
  type: 'object',
  properties: {
    id: { type: 'integer', example: 1 },
    ticket_id: { type: 'integer', example: 1 },
    user_id: { type: 'integer', example: 2 },
    username: { type: 'string', example: 'alice' },
    body: { type: 'string', example: 'Herhangi bir güncelleme var mı?' },
    created_at: { type: 'string' },
  },
};

const authResponseSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', description: 'JWT access token, 15 dakika ömürlü' },
    refreshToken: { type: 'string', description: 'Opaque refresh token, DB\'de hash olarak saklanır, 30 gün ömürlü' },
    user: userSchema,
  },
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

const paginationParams = [
  { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

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
      Department: departmentSchema,
      Channel: channelSchema,
      Message: messageSchema,
      Notification: notificationSchema,
      AuditLog: auditLogSchema,
      Stats: statsSchema,
      Todo: todoSchema,
      AdminTodo: adminTodoSchema,
      Ticket: ticketSchema,
      AdminTicket: adminTicketSchema,
      TicketComment: ticketCommentSchema,
      AuthResponse: authResponseSchema,
      Error: errorSchema,
    },
  },
  tags: [
    { name: 'Auth', description: 'Kayıt, giriş, oturum bilgisi' },
    { name: 'Departments', description: 'Departman listesi ve yönetimi' },
    { name: 'Channels', description: 'Şirket chat\'i - departman kanalları ve mesajlar' },
    { name: 'Notifications', description: 'Bildirimler' },
    { name: 'Admin - Audit Log', description: 'Yazma-kritik işlemlerin denetim kaydı (admin)' },
    { name: 'Admin - Stats', description: 'Departman/kullanıcı/mesaj istatistikleri (admin)' },
    { name: 'Todos', description: 'Kendi todo\'ların (CRUD)' },
    { name: 'Tickets', description: 'Kendi helpdesk taleplerin (CRUD)' },
    { name: 'Admin - Users', description: 'Kullanıcı yönetimi (admin)' },
    { name: 'Admin - Todos', description: 'Tüm todo\'lar üzerinde moderasyon (admin)' },
    { name: 'Admin - Tickets', description: 'Helpdesk kuyruğu yönetimi (admin her şeyi görür; dept_lead sadece kendi departmanının taleplerini görür/günceller, silemez)' },
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
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token karşılığında yeni bir access token al (token rotasyonu: eski refresh token iptal edilir)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } },
            },
          },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: authResponseSchema } } },
          400: badRequest,
          401: { description: 'Geçersiz, süresi dolmuş veya iptal edilmiş refresh token', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token\'ı iptal et',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } },
            },
          },
        },
        responses: {
          204: { description: 'İptal edildi (bilinmeyen/zaten iptal edilmiş token için de 204 döner)' },
          400: badRequest,
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
    '/api/departments': {
      get: {
        tags: ['Departments'],
        summary: 'Departmanları listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: departmentSchema } } } },
          401: unauthorized,
        },
      },
      post: {
        tags: ['Departments'],
        summary: 'Yeni departman oluştur (slug isimden otomatik türetilir)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', example: 'Pazarlama' } } },
            },
          },
        },
        responses: {
          201: { description: 'Oluşturuldu', content: { 'application/json': { schema: departmentSchema } } },
          400: badRequest,
          401: unauthorized,
          403: forbidden,
          409: { description: 'Aynı isim/slug zaten var', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/departments/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: {
        tags: ['Departments'],
        summary: 'Departmanı yeniden adlandır',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } },
            },
          },
        },
        responses: {
          200: { description: 'Güncellendi', content: { 'application/json': { schema: departmentSchema } } },
          400: badRequest,
          401: unauthorized,
          403: forbidden,
          404: notFound,
          409: { description: 'Aynı isim/slug zaten var', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      delete: {
        tags: ['Departments'],
        summary: 'Departmanı sil (üyesi veya talebi varsa 409)',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Silindi' },
          401: unauthorized,
          403: forbidden,
          404: notFound,
          409: { description: 'Departmanın hâlâ üyesi veya talebi var', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/channels': {
      get: {
        tags: ['Channels'],
        summary: 'Erişebildiğim kanalları listele (kendi departmanım + #genel; admin hepsini görür)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: channelSchema } } } },
          401: unauthorized,
        },
      },
    },
    '/api/channels/{id}/messages': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Channels'],
        summary: 'Kanaldaki mesajları listele (cursor tabanlı sayfalama)',
        description:
          'Klasik page/limit yerine cursor kullanır: `before=<message_id>` eski mesajları yükler, `after=<message_id>` yeni mesajları yoklamak (polling) içindir. Hiçbiri verilmezse en son `limit` mesaj dönülür.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'before', in: 'query', required: false, schema: { type: 'integer' }, description: 'Bu mesaj id\'sinden daha eski mesajları getir' },
          { name: 'after', in: 'query', required: false, schema: { type: 'integer' }, description: 'Bu mesaj id\'sinden sonraki (yeni) mesajları getir - polling için' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          200: { description: 'OK (kronolojik sırada, eskiden yeniye)', content: { 'application/json': { schema: { type: 'array', items: messageSchema } } } },
          400: badRequest,
          401: unauthorized,
          403: { description: 'Bu kanalın üyesi değilsiniz', content: { 'application/json': { schema: errorSchema } } },
          404: notFound,
        },
      },
      post: {
        tags: ['Channels'],
        summary: 'Kanala mesaj gönder (dakikada 30 mesaj/kullanıcı sınırı)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } },
            },
          },
        },
        responses: {
          201: { description: 'Oluşturuldu', content: { 'application/json': { schema: messageSchema } } },
          400: badRequest,
          401: unauthorized,
          403: { description: 'Bu kanalın üyesi değilsiniz', content: { 'application/json': { schema: errorSchema } } },
          404: notFound,
          429: { description: 'Mesaj flood limiti aşıldı (dakikada 30)', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/channels/{id}/messages/{mid}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'mid', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      delete: {
        tags: ['Channels'],
        summary: 'Mesajı sil - yazan veya admin',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Silindi' },
          401: unauthorized,
          403: { description: 'Bu kanalın üyesi değilsiniz veya mesajı yazan/admin değilsiniz', content: { 'application/json': { schema: errorSchema } } },
          404: notFound,
        },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Bildirimlerimi listele (sayfalı, opsiyonel ?unread=true filtresi)',
        security: [{ bearerAuth: [] }],
        parameters: [
          ...paginationParams,
          { name: 'unread', in: 'query', required: false, schema: { type: 'string', enum: ['true'] }, description: 'Sadece okunmamışları getir' },
        ],
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: notificationSchema } } },
          },
          401: unauthorized,
        },
      },
    },
    '/api/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Tüm bildirimlerimi okundu işaretle',
        security: [{ bearerAuth: [] }],
        responses: { 204: { description: 'İşaretlendi' }, 401: unauthorized },
      },
    },
    '/api/notifications/{id}/read': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      patch: {
        tags: ['Notifications'],
        summary: 'Bildirimi okundu işaretle',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'İşaretlendi', content: { 'application/json': { schema: notificationSchema } } },
          401: unauthorized,
          404: notFound,
        },
      },
    },
    '/api/todos': {
      get: {
        tags: ['Todos'],
        summary: 'Kendi todo\'larımı listele (sayfalı, filtrelenebilir, sıralanabilir)',
        security: [{ bearerAuth: [] }],
        parameters: [
          ...paginationParams,
          { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending', 'done'] } },
          { name: 'priority', in: 'query', required: false, schema: { type: 'string', enum: ['low', 'medium', 'high'] } },
          { name: 'sort', in: 'query', required: false, schema: { type: 'string', enum: ['created_at', 'updated_at', 'due_date', 'priority', 'title'] } },
          { name: 'order', in: 'query', required: false, schema: { type: 'string', enum: ['asc', 'desc'] } },
        ],
        responses: {
          200: {
            description: 'OK. X-Total-Count ve RFC5988 Link header (first/prev/next/last) içerir.',
            headers: {
              'X-Total-Count': { schema: { type: 'integer' } },
              Link: { schema: { type: 'string' } },
            },
            content: { 'application/json': { schema: { type: 'array', items: todoSchema } } },
          },
          400: badRequest,
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
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  due_date: { type: 'string', nullable: true, example: '2026-08-01' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
                },
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
        summary: 'Todo güncelle (title/description/status/due_date/priority - hepsi opsiyonel)',
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
                  due_date: { type: 'string', nullable: true },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
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
        summary: 'Kendi taleplerimi listele (sayfalı)',
        security: [{ bearerAuth: [] }],
        parameters: paginationParams,
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: ticketSchema } } },
          },
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
                required: ['subject', 'message', 'department_id'],
                properties: {
                  subject: { type: 'string' },
                  message: { type: 'string' },
                  todo_id: { type: 'integer', nullable: true, description: 'Sadece kendi todo\'larından biri olabilir' },
                  department_id: { type: 'integer', description: 'Talebin yönlendirileceği departman' },
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
    '/api/tickets/{id}/comments': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
      get: {
        tags: ['Tickets'],
        summary: 'Talebin yorumlarını listele (sayfalı) - sahibi veya admin',
        security: [{ bearerAuth: [] }],
        parameters: paginationParams,
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: ticketCommentSchema } } },
          },
          401: unauthorized,
          404: { description: 'Talep bulunamadı (veya sahibi/admin değilsiniz)', content: { 'application/json': { schema: errorSchema } } },
        },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Talebe yorum ekle - sahibi veya admin (closed talebe eklenemez)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['body'], properties: { body: { type: 'string' } } },
            },
          },
        },
        responses: {
          201: { description: 'Oluşturuldu', content: { 'application/json': { schema: ticketCommentSchema } } },
          400: badRequest,
          401: unauthorized,
          404: { description: 'Talep bulunamadı (veya sahibi/admin değilsiniz)', content: { 'application/json': { schema: errorSchema } } },
          409: { description: 'Talep closed durumunda, yorum eklenemez', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/tickets/{id}/comments/{cid}': {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
        { name: 'cid', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      delete: {
        tags: ['Tickets'],
        summary: 'Yorumu sil - yazan veya admin',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Silindi' },
          401: unauthorized,
          403: { description: 'Yorumu yazan veya admin değilsiniz', content: { 'application/json': { schema: errorSchema } } },
          404: { description: 'Talep veya yorum bulunamadı', content: { 'application/json': { schema: errorSchema } } },
        },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin - Users'],
        summary: 'Tüm kullanıcıları listele (sayfalı)',
        security: [{ bearerAuth: [] }],
        parameters: paginationParams,
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: userSchema } } },
          },
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
        summary: 'Kullanıcının rolünü ve/veya departmanını değiştir (en az biri zorunlu)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'dept_lead', 'admin'] },
                  department_id: { type: 'integer' },
                },
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
        summary: 'Tüm kullanıcıların todo\'larını listele (sayfalı)',
        security: [{ bearerAuth: [] }],
        parameters: paginationParams,
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: adminTodoSchema } } },
          },
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
        summary: 'Tüm helpdesk taleplerini listele (sayfalı, opsiyonel departman filtresi)',
        security: [{ bearerAuth: [] }],
        parameters: [
          ...paginationParams,
          { name: 'department', in: 'query', required: false, schema: { type: 'string', example: 'donanim' }, description: 'Departman slug\'ı ile filtrele' },
        ],
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: adminTicketSchema } } },
          },
          400: { description: 'Bilinmeyen departman slug\'ı', content: { 'application/json': { schema: errorSchema } } },
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
    '/api/admin/audit-logs': {
      get: {
        tags: ['Admin - Audit Log'],
        summary: 'Denetim kaydını listele (sayfalı) - sadece silme, rol değişimi ve ticket kapatma gibi yazma-kritik işlemler loglanır',
        security: [{ bearerAuth: [] }],
        parameters: paginationParams,
        responses: {
          200: {
            description: 'OK. X-Total-Count ve Link header içerir.',
            headers: { 'X-Total-Count': { schema: { type: 'integer' } }, Link: { schema: { type: 'string' } } },
            content: { 'application/json': { schema: { type: 'array', items: auditLogSchema } } },
          },
          401: unauthorized,
          403: forbidden,
        },
      },
    },
    '/api/admin/stats': {
      get: {
        tags: ['Admin - Stats'],
        summary: 'Departman bazında ticket sayıları, ortalama kapanma süresi, kullanıcı başına todo, son 7 gün mesaj hacmi',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: statsSchema } } },
          401: unauthorized,
          403: forbidden,
        },
      },
    },
  },
};
