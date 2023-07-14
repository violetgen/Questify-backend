import {
  successResponse,
  errorResponse,
  getNftOwner,
  checkIfNftOwner,
  throwError,
  getNftImageLink,
  getProfileData,
} from "../../../utils";
import UserModel from "../../User/model";
import _ from "lodash";
import axios from "axios";
import { isProfileVisible } from "../helpers";

export const uploadProfilePicController = async (req, res) => {
  try {
    const {
      body: { url },
      session: { userId },
    } = req;

    let profile;

    profile = await req.profile();
    profile.stepsCompleted.profilePicUpdated = true;
    const visible = isProfileVisible(profile);
    await UserModel.updateOne(
      { _id: userId },
      {
        "stepsCompleted.profilePicUpdated": true,
        "profileImage": {
          link: url,
        },
        visible,
      }
    );

    profile = await getProfileData(userId);

    return successResponse({ res, response: { profile } });
  } catch (err) {
    return errorResponse({ res, err });
  }
};
