# Dockerfile (Refactored)

# 1. Use a specific, version-pinned base image for stability and efficiency.
# The -chrome variant is smaller than the full playwright image.
FROM apify/actor-node-playwright-chrome:20

# 2. Copy only package manifests to leverage Docker layer caching.
# This layer is only rebuilt if package.json or package-lock.json changes.
COPY package.json package-lock.json ./

# 3. Install production dependencies.
# The --omit=dev flag is now the standard for production builds.
# Using the recommended quiet and no-progress flags for cleaner logs.
RUN npm install --omit=dev \
   && echo "Installed NPM packages:" \
   && (npm list --omit=dev --all || true) \
   && echo "Node.js version:" \
   && node --version \
   && echo "NPM version:" \
   && npm --version

# 4. Copy the rest of the actor's source code.
# This is done after npm install, so changes to code don't invalidate the dependency layer.
COPY . .

# 5. Set the command to run when the container starts.
# The Apify platform's default command is `npm start`, so this is technically
# redundant if your package.json has a "start" script, but it's good practice to be explicit.
CMD ["npm", "start"]
