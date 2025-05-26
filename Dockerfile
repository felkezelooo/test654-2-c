# Use the Apify base image with Node.js 20 and Playwright
FROM apify/actor-node-playwright:20

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install NPM packages
# This will install dependencies specified in your package.json
RUN npm install --omit=dev

# Copy the rest of the actor's source code
COPY . ./

# Set the command to run when the container starts
CMD ["node", "main.js"]
