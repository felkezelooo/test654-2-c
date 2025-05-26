FROM apify/actor-node-playwright:18

# Copy only package.json and package-lock.json (if it exists and is specific to this actor)
COPY package.json ./
# COPY package-lock.json ./

# Clean install of dependencies based on package.json
# Removing existing node_modules and package-lock.json (if any from base image or cache)
# ensures a fresh install.
RUN rm -rf node_modules package-lock.json \
 && npm cache clean --force --quiet \
 && npm --quiet set progress=false \
 && echo "Running npm install for production dependencies without optional ones..." \
 && npm install --only=prod --no-optional \
 && echo "Installed NPM packages (production, no optional, depth 0):" \
 && (npm list --depth=0 --omit=dev --omit=optional || true) \
 && echo "Node.js version:" \
 && node --version \
 && echo "NPM version:" \
 && npm --version

# Copy the rest of the actor's source code
COPY . ./

# Set the command to run when the container starts
CMD ["node", "main.js"]
