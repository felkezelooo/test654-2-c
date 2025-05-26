# Use the Apify base image with Node.js 20 and Playwright
FROM apify/actor-node-playwright:20

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install NPM packages
# Using --force to try and bypass the platform incompatibility of browser-with-fingerprints.
# This is risky and may lead to runtime errors if that package is essential.
RUN npm install --omit=dev --force

# Copy the rest of the actor's source code
COPY . ./

# Set the command to run when the container starts
CMD ["node", "main.js"]
