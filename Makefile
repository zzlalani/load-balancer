# Variables
APP_NAME = load-balancer
NETWORK_NAME = echo-network

# Install dependencies
install:
	npm ci

# Run tests
test:
	npm test

# Run unit tests
test-unit:
	npm run test:unit

# Run integration tests
test-integration:
	npm run test:integration

# Run test coverage
test-coverage:
	npm run test:coverage

# Create Docker network if it doesn't exist
create-network:
	docker network inspect $(NETWORK_NAME) >/dev/null 2>&1 || docker network create $(NETWORK_NAME)

# Build Docker image
docker-build: create-docker-env
	docker build -t $(APP_NAME) .

# Run Docker container
docker-up: create-network create-docker-env
	docker-compose up -d

# Stop Docker container
docker-down:
	docker-compose down

# View Docker logs
docker-logs:
	docker-compose logs -f

# Create test scripts
create-test-scripts:
	@echo '#!/bin/bash' > test-round-robin.sh
	@echo 'echo "Testing Round Robin Load Balancer..."' >> test-round-robin.sh
	@echo 'echo "Sending 6 requests to test round-robin distribution..."' >> test-round-robin.sh
	@echo 'for i in {1..6}; do' >> test-round-robin.sh
	@echo '  echo "Request $$i:"' >> test-round-robin.sh
	@echo '  curl -s -X POST -H "Content-Type: application/json" -d '"'"'{"game":"Mobile Legends", "gamerID":"GYUTDTE", "points":20, "request":'"'"'$$i'"'"'}'"'"' http://localhost:9000/api/echo' >> test-round-robin.sh
	@echo '  echo -e "\n"' >> test-round-robin.sh
	@echo '  sleep 1' >> test-round-robin.sh
	@echo 'done' >> test-round-robin.sh
	@echo '' >> test-round-robin.sh
	@echo 'echo "Testing health endpoint:"' >> test-round-robin.sh
	@echo 'curl -s http://localhost:9000/health | json_pp' >> test-round-robin.sh
	@chmod +x test-round-robin.sh

# Test the load balancer
test-load-balancer: create-test-scripts
	./test-round-robin.sh

# Run development server
dev:
	npm run dev

# Run the application
start:
	npm start

# Clean
clean:
	rm -f test-round-robin.sh
	rm -rf node_modules

# All-in-one command to set up and run demo
demo: install docker-build docker-up test-load-balancer

.PHONY: install test test-unit test-integration test-coverage create-network create-docker-env docker-build docker-up docker-down docker-logs create-test-scripts test-load-balancer dev start clean demo
