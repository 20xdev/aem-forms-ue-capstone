const MOCK_API_BASE_URL = 'https://mock-apis-g29l.onrender.com';
const CONTEXT_PARAM = {
  partnerID: 'HDFCBANK',
  channelID: 'ADOBE',
  productName: 'PL',
  partnerJourneyID: '160120221234567890',
  bankJourneyID: '20211601234567890',
};

/**
 * Get Full Name
 * @name getFullName Concats first name and last name
 * @param {string} firstname in Stringformat
 * @param {string} lastname in Stringformat
 * @return {string}
 */
function getFullName(firstname, lastname) {
  return `${firstname} ${lastname}`.trim();
}

/**
 * Custom submit function
 * @name submitFormArrayToString Submits form data with arrays converted to comma-separated strings
 * @param {scope} globals
 */
function submitFormArrayToString(globals) {
  const data = globals.functions.exportData();
  Object.keys(data).forEach((key) => {
    if (Array.isArray(data[key])) {
      data[key] = data[key].join(',');
    }
  });
  globals.functions.submitForm(data, true, 'application/json');
}

/**
 * Calculate the number of days between two dates.
 * @name days Calculates number of days between two dates
 * @param {*} endDate
 * @param {*} startDate
 * @returns {number} returns the number of days between two dates
 */
function days(endDate, startDate) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  // return zero if dates are valid
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  const diffInMs = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffInMs / (1000 * 60 * 60 * 24));
}

/**
 * Masks the first 5 digits of the mobile number with *
 * @name maskMobileNumber Masks first 5 digits of mobile number
 * @param {string} mobileNumber
 * @returns {string} returns the mobile number with first 5 digits masked
 */
function maskMobileNumber(mobileNumber) {
  if (!mobileNumber) {
    return '';
  }
  const value = mobileNumber.toString();
  return ` ${'*'.repeat(5)}${value.substring(5)}`;
}

/**
 * Initiates customer identification — called when OTP step initializes
 * @name initiateCustomerIdentification Sends mobile and PAN/DOB to identify customer
 * @param {scope} globals
 */
function initiateCustomerIdentification(globals) {
  const formData = globals.functions.exportData();
  const mobileNo = formData.mobileNo || '';
  if (!mobileNo) return '';
  const panNo = formData.panNo || '';
  const rawDob = formData.dateOfBirth || formData.dob || '';
  const dobFormatted = rawDob ? String(rawDob).replace(/-/g, '') : '';
  const identifierName = panNo ? 'PAN_NO' : 'DOB';
  const identifierValue = panNo || dobFormatted;
  const payload = {
    contextParam: { ...CONTEXT_PARAM },
    requestString: {
      mobileNo,
      identifierName,
      identifierValue,
      msgType: 'S',
      fillerFields: {},
    },
  };
  fetch(`${MOCK_API_BASE_URL}/initiateCustomerIdentification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        globals.functions.setProperty('offerAvailable', { value: data.responseString.offerAvailable });
        globals.functions.setProperty('existingCustomer', { value: data.responseString.existingCustomer });
        globals.functions.setProperty('bankJourneyID', { value: data.contextParam.bankJourneyID });
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.setProperty('apiError', { value: data.status.errorDesc });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Unable to reach server. Please try again.';
      globals.functions.setProperty('apiError', { value: msg });
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

/**
 * Verifies OTP and loads customer demographic and offer details
 * @name verifyOTPAndGetDemogDetails Validates OTP and populates customer fields
 * @param {string} otp 6-digit OTP entered by user
 * @param {scope} globals
 */
function verifyOTPAndGetDemogDetails(otp, globals) {
  if (!otp || String(otp).length !== 6) return '';
  const bankJourneyID = globals.functions.getProperty('bankJourneyID')?.value
    || CONTEXT_PARAM.bankJourneyID;
  const payload = {
    contextParam: { ...CONTEXT_PARAM, bankJourneyID },
    requestString: {
      passwordValue: otp,
      fillerFields: {},
    },
  };
  fetch(`${MOCK_API_BASE_URL}/verifyOTPAndGetDemogDetails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        const customer = data.responseString.OfferDemogDetails?.[0];
        if (customer) {
          globals.functions.setProperty('customerFirstName', { value: customer.customerFirstName });
          globals.functions.setProperty('customerLastName', { value: customer.customerLastName });
          globals.functions.setProperty('customerCity', { value: customer.customerCity });
          globals.functions.setProperty('customerState', { value: customer.customerState });
          globals.functions.setProperty('emailAddress', { value: customer.emailAddress });
          globals.functions.setProperty('offerAmount', { value: customer.offerAmount });
          globals.functions.setProperty('offerType', { value: customer.offerType });
          globals.functions.setProperty('tenure', { value: customer.tenure });
          globals.functions.setProperty('rateOfInterest', { value: customer.rateOfInterest });
          globals.functions.setProperty('customerID', { value: customer.customerID });
          globals.functions.setProperty('accountNumber', { value: customer.accountNumber });
        }
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.setProperty('otpError', { value: data.status.errorDesc });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'OTP verification failed. Please try again.';
      globals.functions.setProperty('otpError', { value: msg });
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

/**
 * Calculates monthly EMI using standard formula
 * @name calculateEMI Calculates EMI: P x r x (1+r)^n / ((1+r)^n - 1)
 * @param {number} principal Loan amount in INR
 * @param {number} annualRate Annual interest rate e.g. 10.20
 * @param {number} tenureMonths Loan tenure in months
 * @return {number} Monthly EMI rounded to nearest rupee
 */
function calculateEMI(principal, annualRate, tenureMonths) {
  const r = annualRate / (12 * 100);
  const n = tenureMonths;
  if (r === 0) return Math.round(principal / n);
  const emi = (principal * r * (1 + r) ** n) / ((1 + r) ** n - 1);
  return Math.round(emi);
}

/**
 * Submits the final loan application — called when Thank You step initializes
 * @name submitLoanApplication Submits loan application and stores acknowledgement ID
 * @param {scope} globals
 */
function submitLoanApplication(globals) {
  const data = globals.functions.exportData();
  const payload = {
    contextParam: { ...CONTEXT_PARAM },
    requestString: {
      loanAmount: data.loanAmount || '',
      tenure: data.tenure || '',
      rateofInterest: data.rateOfInterest || '',
      emi: data.emi || '',
      processingfees: data.processingFees || '',
      product: 'PL',
      consentToCALL: data.consentToCALL || 'Y',
      monthlyTakeHomeSalary: data.monthlyIncome || '',
      employerName: data.employerName || '',
      vkycConsent: 'Y',
      fillerFields: {},
    },
  };
  fetch(`${MOCK_API_BASE_URL}/submitLoanApplication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((response) => response.json())
    .then((result) => {
      if (result?.status?.responseCode === '0') {
        globals.functions.setProperty('acknowledgementId', { value: result.responseString.acknowledgementId });
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.setProperty('apiError', { value: result.status.errorDesc });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: result.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Loan submission failed. Please try again.';
      globals.functions.setProperty('apiError', { value: msg });
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

/**
 * Advances the loan wizard to the next step without an API call.
 * Bind this on Click in Rule Editor for steps that require no server validation.
 * @name proceedToNextStep Navigates to the next wizard step
 */
function proceedToNextStep() {
  document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
  return '';
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName,
  days,
  submitFormArrayToString,
  maskMobileNumber,
  initiateCustomerIdentification,
  verifyOTPAndGetDemogDetails,
  calculateEMI,
  submitLoanApplication,
  proceedToNextStep,
};
