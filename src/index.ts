import { createApp } from './server.js';

const PORT = process.env.PORT || 3002;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Content service listening on port ${PORT}`);
});
