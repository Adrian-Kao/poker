module.exports = {
  apps: [
    {
      name: "poker-colyseus-server",
      script: "./dist/server/server/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
