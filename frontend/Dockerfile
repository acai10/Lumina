FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the locked versions (reproducible), unlike `npm install`
# which may re-resolve and drift from package-lock.json.
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
