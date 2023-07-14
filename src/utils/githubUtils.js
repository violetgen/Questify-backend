import axios from "axios";
import UserModel from "../modules/User/model";
import base64 from "base-64";

export const getGithubAccessToken = async (userId, code, redirect_uri) => {
  const params = {
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    code,
    scope: "read:user",
    redirect_uri,
  };
  const config = { headers: { Accept: "application/vnd.github+json" } };
  const paramsString = new URLSearchParams(params);

  const response = await axios.post(
    "https://github.com/login/oauth/access_token",
    paramsString,
    config
  );

  const { access_token: accessToken } = response.data;

  await UserModel.updateOne(
    { _id: userId },
    {
      "externalLinks.github.accessToken": accessToken,
    }
  );
  return accessToken;
};

export const getGithubUser = async (accessToken) => {
  const { data } = await axios.get("https://api.github.com/user", {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  return data;
};

export const githubAuthorizationToken = (() => {
  const token = `${process.env.GITHUB_CLIENT_ID}:${process.env.GITHUB_CLIENT_SECRET}`;
  const encodedToken = base64.encode(token);
  return "Basic " + encodedToken;
})();

export const revokeGithub = async (accessToken) => {
  let data = {
    // client_id: process.env.GITHUB_CLIENT_ID,
    // client_secret: process.env.GITHUB_CLIENT_SECRET,
    access_token: accessToken,
  };
  // const params = new URLSearchParams(data);
  let headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    // "Authorization": githubAuthorizationToken
  };
  const { data: response } = await axios.delete(
    `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
    data,
    {
      headers,
    }
  );
  console.log("response: ", response.data);
  return response;
};

export const refreshGithubToken = async (refreshToken, userId) => {
  let data = {
    client_id: process.env.GITHUB_CLIENT_ID,
    client_secret: process.env.GITHUB_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const params = new URLSearchParams(data);
  let headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const { data: response } = await axios.post(
    "https://discord.com/api/oauth2/token",
    params,
    {
      headers,
    }
  );
  await UserModel.updateOne(
    { _id: userId },
    { "externalLinks.github.refreshToken": response }
  );
  return response;
};
