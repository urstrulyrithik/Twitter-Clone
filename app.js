const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "RithikTwitterClone", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `select * from user where username="${username}";`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `insert into user (name,username,password,gender)
      values("${name}","${username}","${hashedPassword}","${gender}");`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username="${username}";`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "RithikTwitterClone");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  //   let followingList = `select following_user_id from follower where follower_user_id=${loggedUserId};`;
  //   const getFollowingList = await db.get(followingList);
  //   response.send(getFollowingList);

  let finalQuery = `select username,tweet,date_time as dateTime from tweet left join follower on
  follower.following_user_id=tweet.user_id left join user on tweet.user_id=user.user_id where follower_user_id=${loggedUserId} order by dateTime desc limit 4; `;
  const finalList = await db.get(finalQuery);
  response.send(finalList);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  let followingListQuery = `select name from follower left join user on
  follower.following_user_id=user.user_id where follower_user_id=${loggedUserId};`;
  const getFollowingList = await db.all(followingListQuery);
  response.send(getFollowingList);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  let followersListQuery = `select name from follower left join user on
  follower.follower_user_id=user.user_id where following_user_id=${loggedUserId};`;
  const getFollowersList = await db.all(followersListQuery);
  response.send(getFollowersList);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  const getTweetDetailsQuery = `select tweet,count(like.like_id)as likes,count(reply.reply_id)as replies,tweet.date_time as dateTime 
  from (
      tweet left join reply on reply.tweet_id=tweet.tweet_id)as tr 
      left join like on tr.tweet_id=like.tweet_id where tweet.tweet_id=${tweetId} and tweet.user_id in (
          select following_user_id from follower where follower_user_id=${loggedUserId}
      );`;

  const getTweetDetails = await db.get(getTweetDetailsQuery);
  if (getTweetDetails === undefined || getTweetDetails.tweet === null) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(getTweetDetails);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `select * from user where username="${username}";`;
    const dbUser = await db.get(getUserDetails);
    const loggedUserId = dbUser.user_id;

    const getLikersList = `select username from like left join user on
    like.user_id=user.user_id where tweet_id=${tweetId};`;
    const likersList = await db.all(getLikersList);
    if (likersList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const finalList = {
        likes: [],
      };
      likersList.forEach((element) => {
        finalList.likes.push(element.username);
      });
      response.send(finalList);
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `select * from user where username="${username}";`;
    const dbUser = await db.get(getUserDetails);
    const loggedUserId = dbUser.user_id;

    const getRepliersList = `select name,reply from reply left join user on
    reply.user_id=user.user_id where tweet_id=${tweetId} and reply.user_id in (
        select following_user_id from follower where follower_user_id=${loggedUserId}
    );`;

    const repliersList = await db.all(getRepliersList);
    if (repliersList.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const finalList = {
        replies: [],
      };
      repliersList.forEach((element) => {
        finalList.replies.push(element);
      });
      response.send(finalList);
    }
  }
);

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  const getAllTweetsQuery = `select tweet, count(like.like_id)as likes,count(reply.reply_id)as replies,tweet.date_time as dateTime
    from tweet left join reply on tweet.tweet_id=reply.tweet_id left join like
    on tweet.tweet_id=like.tweet_id where tweet.user_id=${loggedUserId} group by tweet.tweet_id ;`;

  const tweetsOfUser = await db.all(getAllTweetsQuery);

  const listOfTweets = [];
  tweetsOfUser.forEach((t) => listOfTweets.push(t));
  response.send(listOfTweets);
});

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetails = `select * from user where username="${username}";`;
  const dbUser = await db.get(getUserDetails);
  const loggedUserId = dbUser.user_id;

  const { tweet } = request.body;

  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hour = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  const postTweetQuery = `insert into tweet (tweet,user_id,date_time)
  values("${tweet}",${loggedUserId},"${year}-${month}-${day} ${hour}:${minutes}:${seconds}");`;

  await db.run(postTweetQuery);
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetails = `select * from user where username="${username}";`;
    const dbUser = await db.get(getUserDetails);
    const loggedUserId = dbUser.user_id;
    const checkQuery = `
        select tweet from tweet where tweet_id=${tweetId} and user_id=${loggedUserId}; `;
    const getTweet = await db.get(checkQuery);

    if (getTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId}`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
