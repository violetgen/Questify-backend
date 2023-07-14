export * from "./usernameValidator";
export * from "./domainValidator";

export const removeWhiteSpaces = (text) => {
  return text.split(/\s{1,}/g).join(" ");
};
