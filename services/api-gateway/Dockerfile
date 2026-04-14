FROM node:18-alpine

WORKDIR /app

# Copy shared library first
COPY shared/events /app/shared/events

WORKDIR /app/services/api-gateway
COPY services/api-gateway/package*.json ./
RUN npm install --omit=dev

COPY services/api-gateway .

EXPOSE 3000

CMD ["npm", "start"]
