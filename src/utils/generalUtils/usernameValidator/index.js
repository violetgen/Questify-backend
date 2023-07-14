import prohibitedUsernames from "./prohibitedUsernames.json";
import UserModel from "../../../modules/User/model";

const MIN_LENGTH = 3;
const REGEX_CHECK = /^[a-z][a-z\d]+$/;

export const usernameValidator = async (username, userId) => {
  try {
    username = username.toLowerCase();
    const validFormat = REGEX_CHECK.test(username);
    if (!validFormat) {
      return {
        available: false,
        reason:
          "Username has invalid format, must be alphanumeric without any special characters and spaces, and must start with an alphabet",
      };
    }

    const validLength = username.length >= MIN_LENGTH;
    if (!validLength) {
      return {
        available: false,
        reason: `Username must have at least ${MIN_LENGTH} characters`,
      };
    }

    if (prohibitedUsernames.includes(username)) {
      return {
        available: false,
        reason: `You cannot use this username`,
      };
    }

    const usernameExists = await UserModel.findOne(
      { username },
      { username: 1, userId: 1 }
    );

    if (usernameExists && usernameExists.id !== userId) {
      return {
        available: false,
        reason: `Username is in use`,
      };
    }
    return { username, available: true };
  } catch (err) {
    return {
      available: false,
      reason: `Unable to validate the username`,
    };
  }
};
