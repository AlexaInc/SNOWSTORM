# Use a lightweight Node.js version
FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the bot code
COPY . .

# Expose the health check port
EXPOSE 8000

# Start the bot
CMD ["node", "index.js"]
