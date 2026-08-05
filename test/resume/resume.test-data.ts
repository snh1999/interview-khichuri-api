import { faker } from "@faker-js/faker/locale/en";

import type { TResumeContent } from "@/src/resume/resume.dto";

export const getResumeContentPayload = (): TResumeContent => ({
  personal: {
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
  },
  professional: {
    title: faker.person.jobTitle(),
  },
  workExperience: [],
  education: [],
  preferences: {},
  links: [],
  publications: [],
  projects: [],
  references: [],
  activities: [],
});
