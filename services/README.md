# Microservices Architecture Overview

This directory hosts the simulated distributed microservices monitored by **PipelineMemory Pre-Flight Risk Engine**:

| Microservice | Primary Responsibilities | Key Dependencies | Primary Risk Factors |
| :--- | :--- | :--- | :--- |
| `payments` | Credit card checkout, refund processing, Stripe gateway | PostgreSQL, Stripe API | Blocking table migrations, unhandled network timeouts, idempotency hazards |
| `auth` | User authentication, JWT issuance & verification | JWT, Redis session store | Hardcoded secret exposure, aggressive downstream token verification timeouts |
| `orders` | Order creation, state orchestration | PostgreSQL | Cross-table joins, distributed locking |
| `inventory` | Stock allocation, reservation holds | Redis cache | Cache stampede, retry storms on exhausted stock |
| `notifications` | Async worker for transactional emails & webhooks | Message Queue (RabbitMQ) | Worker backpressure, queue exhaustion |

All services are subject to PipelineMemory Pre-Flight Risk Gate checks on PR creation and branch comparison.
