import express from "express";
import mongoose from "mongoose";
import MongoStore from "connect-mongo";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import session from "express-session";
import Agenda from "agenda";
import { TwitterApi } from "twitter-api-v2";
import Rollbar from "rollbar";
import cors from "cors";
import morgan from "morgan";

import {
  authModule,
  nftModule,
  profileModule,
  tweetModule,
  userModule,
  chatModule,
  collectionModule,
  eventModule,
  gameModule,
} from "./modules";
import TetrisModel from "./modules/Tetris/model";
import { authenticate } from "./middlewares";
import Mailer from "./mailer";
import { fetchAllNftInCollection } from "./helpers/magicedenHelpers";
import { daoModule } from "./modules/DAO";
import NodeCache from "node-cache";
import { testModule } from "./modules/Test";
import { tetrisModule } from "./modules/Tetris";
import { doublejumpModule } from "./modules/Doublejump";
import { signModule } from "./modules/Sign";
import { zealyModule } from "./modules/Zealy";
import { tokenModule } from "./modules/Token";

// import { nftCollectionModule } from "./modules/NFTCollections";
import { getProfileData } from "./modules/Profile/helpers";
import { getTwitterApi } from "./helpers";
import { socketService } from "./services/socket";
import { clusterApiUrl, Connection } from "@solana/web3.js";
import CronManager from "./cronManager";

class Server {
  constructor({ port }) {
    this.express = express();
    this.express.set("port", port);
    this.server = require("http").createServer(this.express);
    this.io = require("socket.io")(this.server, {
      cors: {
        origins: "*:*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    this.start();
    return this.server;
  }
  async start() {
    this.connectDatabase();
    socketService(this.io);
    this.initSessions();
    this.initCache();
    this.initMiddleware();
    this.forceSecure();
    this.insertHelpers();
    this.cronManager = new CronManager();
    this.publicRoot = path.join("public");
    this.express.use(express.static(this.publicRoot));
    this.initPublicRoutes();
    this.initPrivateRoutes();
    this.express.use("/*", (req, res) => {
      res.sendFile("index.html", { root: this.publicRoot });
    });
    this.initErrorHandler();
    this.initErrorRoute();
    this.initApis();
    this.startNftQueue();
    // await this.initMailer(); <== we will enable later
  }
  async connectDatabase() {
    await mongoose
      .connect(process.env.MONGO_URL, {
        useNewUrlParser: true,
        autoIndex: true,
      })
      // .TetrisModel.find({})
      .then((doc) => {
        console.log("> Successfully Connected to DB!");
      })
      .catch((err) => console.log("ERROR: ", err));
    const db = mongoose.connection;
    db.on("error", console.error.bind(console, "connection error:"));
    db.once("open", () => {
      console.log("DB has been connected");
    });
  }
  initSessions() {
    const opts = {};
    if (process.env.PRODUCTION == "true") {
      opts.cookie = {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 48,
      };
    } else {
      opts.cookie = {
        maxAge: 1000 * 60 * 60 * 48,
      };
    }
    this.express.use(
      session({
        ...opts,
        saveUninitialized: false,
        resave: true,
        name: "solaritySession",
        secret: process.env.SESSION_SECRET,
        store: MongoStore.create({
          mongoUrl: process.env.MONGO_URL,
        }),
      })
    );
  }
  async initMailer() {
    // for later user
    const mailer = new Mailer();
    await mailer.init();
    global.mailer = this.express.set("mailer", mailer);
  }
  initPublicRoutes() {
    // put here the public routes
    console.log("> Starting public routes");
    this.express.use("/api/test", testModule);
    this.express.use("/api/auth", authModule);
    this.express.use("/api/daos", daoModule);
    this.express.use("/api/games", gameModule);
    this.express.use("/api/zealy", zealyModule);
  }
  initPrivateRoutes() {
    // put here the private routes
    console.log("> Starting private routes");
    this.express.use("/api/profile", authenticate, profileModule);
    this.express.use("/api/nfts", nftModule);
    this.express.use("/api/tweets", tweetModule);
    this.express.use("/api/users", userModule);
    this.express.use("/api/tetrises", tetrisModule);
    this.express.use("/api/tokens", tokenModule);
    this.express.use("/api/doublejump", doublejumpModule);
    this.express.use("/api/sign", signModule);
    this.express.use("/api/chats", chatModule);
    this.express.use("/api/collections", collectionModule);
    this.express.use("/api/events", eventModule);
    this.express.use("/api/*", (req, res, next) => {
      const err = new Error("Route Not Found");
      err.status = 404;
      next(err);
    });
  }
  initMiddleware() {
    // middleware initialization
    this.express.use(morgan("common"));
    this.express.use(helmet());
    this.express.set("trust proxy", 1);
    const corsOptions = {
      // origin: [
      //   "http://localhost:3000",
      //   "http://localhost:3002",
      //   "https://solarity-web-git-master-hassan-sk.vercel.app",
      //   "https://solarity-frontend.vercel.app",
      //   "https://solarityvr.github.io",
      //   "https://127.0.0.1:5501",
      //   "http://127.0.0.1:5500",
      // ],
      origin: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true, //access-control-allow-credentials:true
      optionSuccessStatus: 200,
    };
    this.express.use(cors(corsOptions));

    this.express.use(express.json());
    this.express.use(express.urlencoded({ extended: false }));
    this.express.use(cookieParser());
  }
  forceSecure() {
    // force to https on production
    this.express.enable("trust proxy");
    this.express.use((req, res, next) => {
      if (process.env.NODE_ENV == "production" && !req.secure) {
        return res.redirect("https://" + req.headers.host + req.url);
      }
      next();
    });
  }
  initCache() {
    const registerNonceCache = new NodeCache({
      useClones: false,
      stdTTL: 3600,
    });
    this.express.set("registerNonceCache", registerNonceCache);
  }
  initErrorRoute() {
    this.express.use((req, res, next) => {
      const err = new Error("Not Found");
      err.status = 404;
      next(err);
    });
    this.express.use((err, req, res, next) => {
      console.log(err);
      res.status(err.status || 500);
      res.locals.error = err;
      res.locals.errorDescription = err.message;
      if (global.rollbar) {
        global.rollbar.error(err);
      }
      return res.send("ERROR: NOT FOUND!");
    });
  }
  initErrorHandler() {
    this.express.use(async (err, req, res, next) => {
      return next(err);
    });
  }
  initApis() {
    // twitter api init
    const twitterApi = getTwitterApi();

    // twitterApi.v2.userTimeline()
    this.express.set("twitterApi", twitterApi);
    // rollbar api
    let rollbar = new Rollbar({
      accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
      captureUncaught: true,
      captureUnhandledRejections: true,
    });
    this.express.set("rollbar", rollbar);
    global.rollbar = rollbar;
  }
  startNftQueue() {
    const nftQueue = new Agenda({
      db: {
        address: process.env.MONGO_URL,
        collection: "nftJobs",
      },
    });
    nftQueue.maxConcurrency(1);
    nftQueue.define("fetchCollection", async ({ attrs: { data } }) => {
      await fetchAllNftInCollection(data);
    });
    nftQueue.start();
    this.express.set("nftQueue", nftQueue);
  }
  insertHelpers() {
    this.express.use((req, res, next) => {
      req.profile = async () => getProfileData(req);
      req.solanaConnection = new Connection(clusterApiUrl("mainnet-beta"));
      next();
    });
  }
}

export default Server;
