# HTTP Round Robin Load Balancer

A Round Robin Load Balancer API implementation that routes HTTP requests to multiple backend service instances.

## Project Overview

This project consists of two main components:

1. **Simple API Service** - A Spring Boot application that echoes back any JSON sent to it
2. **Round Robin Load Balancer** - A Node.js application that distributes requests across multiple instances of the Simple API

The load balancer implements a round-robin algorithm to distribute incoming traffic across all available backend servers, with health checks and automatic failover functionality.

## Features

- Round-robin request distribution
- Health checks for backend servers
- Automatic failover to healthy instances
- Response time tracking
- Configurable retry mechanism
- Detailed logging
- Comprehensive test coverage

## Architecture

```
                   ┌─────────────────┐
                   │                 │
 Client Request ──▶│  Load Balancer  │
                   │    (Node.js)    │
                   │   Port: 9000    │
                   │                 │
                   └────────┬────────┘
                            │
                            ▼
          ┌─────────────────┬─────────────────┐
          │                 │                 │
┌─────────▼──────┐  ┌───────▼────────┐  ┌─────▼────────────┐
│                │  │                │  │                  │
│ Echo Service   │  │ Echo Service   │  │  Echo Service    │
│ (Spring Boot)  │  │ (Spring Boot)  │  │  (Spring Boot)   │
│ Port: 8080     │  │ Port: 8081     │  │  Port: 8082      │
│                │  │                │  │                  │
└────────────────┘  └────────────────┘  └──────────────────┘
```

## Prerequisites

- Docker and Docker Compose
- Git
- Node.js 22.13.0+ (only for local development)
- Java 21+ (only for local development)

## Quick Start with Docker

### 1. Clone the repository and start load-balancer

```bash
git clone git@github.com:zzlalani/load-balancer.git
cd load-balancer
make docker-build docker-up
```

### 2. Clone the repository and start codasimpledemo echo-service

```bash
git clone git@github.com:zzlalani/codasimpledemo.git
cd codasimpledemo
make demo
```

This will start:
- 3 instances of the Echo API service on ports 8080, 8081, and 8082
- 1 instance of the Load Balancer on port 9000

### 3. Test the setup

Send a POST request to the load balancer:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"game":"Mobile Legends", "gamerID":"GYUTDTE", "points":20}' \
  http://localhost:9000/api/echo
```

You should receive the same JSON payload back. The load balancer will route your requests to different backend instances in round-robin fashion.

### 4. Check the health of backend services

```bash
curl http://localhost:9000/health
```

## Manual Setup (without Docker)

### Running the Echo Service (Spring Boot)

1. Navigate to the Echo Service directory:
   ```bash
   cd codasimpledemo
   ```

2. Build the application:
   ```bash
   ./mvnw clean package
   ```

3. Run multiple instances on different ports:
   ```bash
   java -jar target/codasimpledemo-0.0.1-SNAPSHOT.jar --server.port=8080 &
   java -jar target/codasimpledemo-0.0.1-SNAPSHOT.jar --server.port=8081 &
   java -jar target/codasimpledemo-0.0.1-SNAPSHOT.jar --server.port=8082 &
   ```

   Alternatively, you can use the provided script:
   ```bash
   ./run-multi-instance.sh
   ```

### Running the Load Balancer (Node.js)

1. Navigate to the Load Balancer directory:
   ```bash
   cd load-balancer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure the backend endpoints in `.env.development`:
   ```
   ENDPOINTS=http://localhost:8080,http://localhost:8081,http://localhost:8082
   ```

4. Start the load balancer:
   ```bash
   npm run dev
   ```

## Configuration

### Load Balancer Configuration (.env files)

- `.env.development` - Development environment configuration
- `.env.test` - Test environment configuration

Key configuration parameters:

| Parameter | Description                                                            | Default                                                           |
|-----------|------------------------------------------------------------------------|-------------------------------------------------------------------|
| PORT | Port the load balancer runs on                                         | 9000                                                              |
| ENDPOINTS | Comma-separated list of backend service URLs                           | http://localhost:8080,http://localhost:8081,http://localhost:8082 |
| TIMEOUT_MS | Request timeout in milliseconds                                        | 30000                                                             |
| MAX_RETRIES | Maximum number of retry attempts                                       | 3                                                                 |
| HEALTH_CHECK_ENABLED | Enable/disable health checks                                           | true                                                              |
| HEALTH_CHECK_INTERVAL_MS | Health check interval in milliseconds                                  | 30000                                                             |
| FAIL_THRESHOLD | Number of consecutive failures before marking an endpoint as unhealthy | 3                                                                 |
| RECOVERY_TIME_MS | Time to wait before retrying an unhealthy endpoint                     | 30000                                                             |
| PERFORMANCE_BASED_ROUTING | performance based routing relying on response time instead of liner    | false                                                             |

## API Endpoints

### Load Balancer Endpoints

- **POST /api/**
    - Forwards any request to a backend service using round-robin algorithm
    - Returns the response from the backend service

- **GET /health**
    - Returns health status of the load balancer and all backend services

### Echo Service Endpoints

- **POST /api/echo**
    - Echoes back the JSON payload received in the request

## Testing

### Load Balancer Tests

```bash
cd load-balancer
npm run test
```

Available test scripts:
- `npm run test:unit` - Run unit tests
- `npm run test:integration` - Run integration tests
- `npm run test:coverage` - Run tests with coverage report

### Echo Service Tests

```bash
cd codasimpledemo
./mvnw test
```

## Stopping Services

### Docker Compose

```bash
docker-compose down
```

### Manual Shutdown

For Echo Service instances:
```bash
./stop-instances.sh
```

For Load Balancer:
Press `Ctrl+C` in the terminal where it's running.

## Design Decisions

### Round Robin Implementation

The load balancer uses a custom round-robin algorithm implementation to distribute requests across backend services. It keeps track of the current index and increments it after each request, cycling back to 0 when it reaches the end of the list.

### Fault Tolerance

The system handles failures in several ways:
1. **Health Tracking**: Each backend endpoint's health is monitored
2. **Failure Detection**: Endpoints are marked as failed after several consecutive failures
3. **Automatic Recovery**: Failed endpoints are periodically checked for recovery
4. **Request Retry**: If a request fails, it's automatically retried on a different endpoint

### Monitoring

The health endpoint provides real-time information about:
- Backend service availability
- Response times
- Failure statistics


## License

[MIT License](LICENSE)
