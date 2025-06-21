# Use the official Apify base image with Playwright for Node.js 18
FROM apify/actor-node-playwright:18

# Copy the package.json and package-lock.json files to leverage Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the actor's source files
COPY . ./

# The base image's default command will run `npm start`, 
# which we've configured in package.json to be `crawlee run`.
# No need for an explicit CMD here.
