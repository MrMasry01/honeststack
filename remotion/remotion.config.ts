import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setCrf(18);
Config.setNumberOfGifLoops(0);
Config.setDelayRenderTimeoutInMilliseconds(60000);
Config.setChromiumOpenGlRenderer("angle");
