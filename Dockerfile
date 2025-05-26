# Use the Apify base image with Node.js and Playwright
FROM apify/actor-node-playwright:18

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install NPM packages
# The apify/actor-node-playwright image already has many things,
# but we ensure our specific dependencies are installed.
RUN npm install --omit=dev

# Copy the rest of the actor's source code
COPY . ./

# Set the command to run when the container starts
CMD ["node", "main.js"]
