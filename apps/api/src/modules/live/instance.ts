import { env } from "../../env";
import { makeLiveKit } from "./livekit";

export const lk = makeLiveKit({
  url: env.LIVEKIT_URL,
  apiKey: env.LIVEKIT_API_KEY,
  apiSecret: env.LIVEKIT_API_SECRET,
});
