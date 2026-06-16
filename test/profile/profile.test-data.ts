/* eslint-disable @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-unsafe-return */
import { faker } from "@faker-js/faker/locale/en";
import { expect } from "vitest";

import {
  expectNullableNumber,
  expectNullableString,
} from "../utils/data-helpers";

export const getProfilePayload = () => ({
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  phone: faker.phone.number(),
  email: faker.internet.email(),
  country: "US",
});

export const getWorkOverviewPayload = () => ({
  title: faker.person.jobTitle(),
  experienceLevel: "senior",
  yearsOfExperience: faker.number.int({ min: 3, max: 15 }),
  skills: [],
  industries: [],
});

export const getWorkExperiencePayload = () => ({
  company: faker.company.name(),
  title: faker.person.jobTitle(),
  startDate: "2020-01",
  endDate: "2022-12",
  isCurrent: false,
  responsibilities: faker.lorem.paragraph(),
});

export const getEducationPayload = () => ({
  degreeName: "Bachelor of Science",
  fieldOfStudy: "Computer Science",
  institution: faker.company.name() + " University",
  country: "US",
  startDate: "2014-09",
  graduationDate: "2018-06",
});

export const getJobPreferencePayload = () => ({
  workType: "remote",
  salaryLower: 120000,
  salaryExpected: 150000,
  currency: "USD",
  preferredLocation: "San Francisco, CA",
  coverLetterTone: "enthusiastic",
  titles: [],
});

export const getProfileLinkPayload = () => ({
  type: "linkedin",
  url: faker.internet.url(),
});

export const expectedProfileStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    firstName: expect.any(String),
    lastName: expect.any(String),
    phone: expectNullableString,
    email: expectNullableString,
    country: expectNullableString,
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
    links: expect.any(Array),
    workOverviews: expect.any(Array),
    workExperiences: expect.any(Array),
    educations: expect.any(Array),
    resumes: expect.any(Array),
    jobPreferences: expect.any(Array),
  });

export const expectedWorkExperienceStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    company: expect.any(String),
    title: expect.any(String),
    startDate: expect.any(String),
    endDate: expectNullableString,
    isCurrent: expect.any(Boolean),
    responsibilities: expectNullableString,
  });

export const expectedEducationStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    degreeName: expect.any(String),
    fieldOfStudy: expectNullableString,
    institution: expect.any(String),
    country: expectNullableString,
    startDate: expectNullableString,
    graduationDate: expectNullableString,
    notes: expectNullableString,
  });

export const expectedJobPreferenceStructure = () =>
  expect.objectContaining({
    id: expect.any(String),
    profileId: expect.any(String),
    workType: expectNullableString,
    salaryLower: expectNullableNumber,
    salaryExpected: expectNullableNumber,
    currency: expect.any(String),
    preferredLocation: expectNullableString,
    coverLetterTone: expectNullableString,
    coverLetterTemplate: expectNullableString,
  });
