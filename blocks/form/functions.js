// Reads API base URL from <meta name="api-base-url"> (set in head.html or per-page metadata).
// Override window.loanFormConfig.apiBaseUrl at runtime if needed (e.g. in tests).
function getApiBase() {
  return (window.loanFormConfig ?? {}).apiBaseUrl
    || document.querySelector('meta[name="api-base-url"]')?.content
    || 'https://mock-apis-g29l.onrender.com';
}

const CONTEXT_PARAM = {
  partnerID: 'HDFCBANK',
  channelID: 'ADOBE',
  productName: 'PL',
  partnerJourneyID: '160120221234567890',
  bankJourneyID: '20211601234567890',
};

// ---- Internal utilities (not exported) -----------------------------------

// Fires to dataLayer (Adobe Analytics / GTM) and as a DOM custom event.
// Never include PII — only event names and safe metadata.
function trackEvent(eventName, metadata = {}) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: `hdfc_loan_${eventName}`, ...metadata });
  document.dispatchEvent(
    new CustomEvent(`loan-analytics:${eventName}`, { detail: metadata }),
  );
}

// Retries only on network-level errors; API-level failures (responseCode != 0) are not retried.
async function fetchWithRetry(url, options, retries = 1) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fetch(url, options);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => { setTimeout(resolve, 1000 * (attempt + 1)); });
      }
    }
  }
  throw lastErr;
}

function jsonPost(path, payload) {
  return fetchWithRetry(`${getApiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((r) => r.json());
}

function setSlider(name, min, max, value) {
  const input = document.querySelector(`[name="${name}"]`);
  if (!input) return;
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  // bubbles:true so the AEM Forms form-level model listener picks up the change
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// processingFee = 1.5% of principal; taxes = 18% GST on processing fee.
function calculateProcessingFee(principal) {
  return Math.round(principal * 0.015);
}

function calculateTaxes(processingFee) {
  return Math.round(processingFee * 0.18);
}

// ---- Exported functions --------------------------------------------------

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
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.floor(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Masks the first 5 digits of the mobile number with *
 * @name maskMobileNumber Masks first 5 digits of mobile number
 * @param {string} mobileNumber
 * @returns {string} returns the mobile number with first 5 digits masked
 */
function maskMobileNumber(mobileNumber) {
  if (!mobileNumber) return '';
  const value = mobileNumber.toString();
  return ` ${'*'.repeat(5)}${value.substring(5)}`;
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
  return Math.round((principal * r * (1 + r) ** n) / ((1 + r) ** n - 1));
}

/**
 * Returns DOB formatted as DDMMYYYY string for use as API identifier value
 * @name getFormattedDob Returns DOB as DDMMYYYY string
 * @param {scope} globals
 * @return {string}
 */
function getFormattedDob(globals) {
  const dob = globals.functions.exportData().dob || '';
  return dob ? String(dob).replace(/-/g, '') : '';
}

/**
 * Tracks a page/step load for analytics — bind on form Initialize event of each fragment
 * @name trackPageLoad Fires an analytics page-load event for the current wizard step
 * @param {string} stepName Name of the step (e.g. 'welcome', 'otp', 'offer')
 * @param {scope} globals
 * @return {string}
 */
function trackPageLoad(stepName, globals) {
  const d = globals.functions.exportData();
  trackEvent('page_load', { stepName, journeyID: d.bankJourneyID || '' });
  return '';
}

// ---- Tier 1 + 2: Customer identification ---------------------------------

/**
 * Initiates customer identification — bind on welcome_next button Click
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
  trackEvent('otp_initiated', { identifierType: identifierName });
  jsonPost('/initiateCustomerIdentification', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        globals.functions.importData({
          offerAvailable: data.responseString.offerAvailable,
          existingCustomer: data.responseString.existingCustomer,
          bankJourneyID: data.contextParam.bankJourneyID,
          maskedMobile: maskMobileNumber(mobileNo),
          otpAttemptsLeft: 3,
          otpAttemptsText: '3/3 attempts left',
          apiError: '',
        });
        trackEvent('otp_sent', { offerAvailable: data.responseString.offerAvailable });
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.importData({ apiError: data.status.errorDesc });
        trackEvent('otp_initiate_failed', { errorCode: data.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Unable to reach server. Please try again.';
      globals.functions.importData({ apiError: msg });
      trackEvent('otp_initiate_error');
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
  const bankJourneyID = globals.functions.exportData().bankJourneyID || CONTEXT_PARAM.bankJourneyID;
  const payload = {
    contextParam: { ...CONTEXT_PARAM, bankJourneyID },
    requestString: { passwordValue: otp, fillerFields: {} },
  };
  jsonPost('/verifyOTPAndGetDemogDetails', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        const customer = data.responseString.OfferDemogDetails?.[0];
        if (customer) {
          const offerAmountNum = parseFloat(customer.offerAmount) || 0;
          const tenureNum = parseInt(customer.tenure, 10) || 36;
          const formData = globals.functions.exportData();

          const fullName = [
            customer.customerFirstName,
            customer.customerMiddleName,
            customer.customerLastName,
          ].filter(Boolean).join(' ');
          const addressParts = [
            customer.customerAddress1,
            customer.customerAddress2,
            customer.customerAddress3,
            customer.customerCity,
            customer.customerState,
            customer.zipCode,
          ].filter(Boolean);
          const fullAddress = addressParts.join(', ');

          const genderMap = {
            M: 'Male', F: 'Female', Male: 'Male', Female: 'Female',
          };
          const genderValue = genderMap[customer.customerGender] || customer.customerGender || '';

          globals.functions.importData({
            // Internal keys used by subsequent API calls
            customerFirstName: customer.customerFirstName,
            customerMiddleName: customer.customerMiddleName,
            customerLastName: customer.customerLastName,
            customerCity: customer.customerCity,
            customerState: customer.customerState,
            customerAddress1: customer.customerAddress1,
            customerAddress2: customer.customerAddress2,
            customerAddress3: customer.customerAddress3,
            zipCode: customer.zipCode,
            customerGender: customer.customerGender,
            customerDob: customer.dateOfBirth,
            emailAddress: customer.emailAddress,
            offerAmount: offerAmountNum,
            offerType: customer.offerType || '',
            tenure: tenureNum,
            rateOfInterest: customer.rateOfInterest || '',
            customerID: customer.customerID,
            accountNumber: customer.accountNumber,
            otpError: '',
            // Customer Details form field bindings
            full_name_as_per_aadhaar: fullName,
            gender: genderValue,
            pan_number: formData.panNo || '',
            personal_email_id: customer.emailAddress || '',
            aadhaar_record_address: fullAddress,
            first_name_pan: customer.customerFirstName || '',
            middle_name_pan: customer.customerMiddleName || '',
            last_name_pan: customer.customerLastName || '',
            monthly_net_income: customer.monthlyIncome || '',
            industry_type: customer.profession || '',
          });
        }
        trackEvent('otp_success');
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        const left = Math.max(0, (globals.functions.exportData().otpAttemptsLeft || 3) - 1);
        globals.functions.importData({
          otpError: data.status.errorDesc,
          otpAttemptsLeft: left,
          otpAttemptsText: `${left}/3 attempts left`,
        });
        trackEvent('otp_failed', { errorCode: data.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'OTP verification failed. Please try again.';
      globals.functions.importData({ otpError: msg });
      trackEvent('otp_error');
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

// ---- Tier 2: PAN Enquiry -------------------------------------------------

/**
 * Validates PAN before OTP — Tier 2 pre-login check
 * @name panEnquiry Validates PAN number against mobile and confirms customer exists
 * @param {scope} globals
 */
function panEnquiry(globals) {
  const d = globals.functions.exportData();
  const panNo = d.panNo || '';
  const mobileNo = d.mobileNo || '';
  if (!panNo || !mobileNo) return '';
  const payload = {
    contextParam: { ...CONTEXT_PARAM },
    requestString: { panNumber: panNo, mobileNo, fillerFields: {} },
  };
  trackEvent('pan_enquiry_initiated');
  jsonPost('/panEnquiry', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        globals.functions.importData({
          panValid: true,
          apiError: '',
        });
        trackEvent('pan_enquiry_success');
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.importData({ panValid: false, apiError: data.status.errorDesc });
        trackEvent('pan_enquiry_failed', { errorCode: data.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'PAN validation failed. Please try again.';
      globals.functions.importData({ apiError: msg });
      trackEvent('pan_enquiry_error');
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

// ---- Tier 2: Bureau Offer ------------------------------------------------

/**
 * Fetches bureau-based loan offer — bind on Personal Info step Proceed button
 * Replaces the mock offer from verifyOTPAndGetDemogDetails with real bureau offer
 * @name getBureauOfferAndProceed Fetches GetBureauOffer and navigates to offer display
 * @param {scope} globals
 */
function getBureauOfferAndProceed(globals) {
  const d = globals.functions.exportData();
  const payload = {
    contextParam: {
      ...CONTEXT_PARAM,
      bankJourneyID: d.bankJourneyID || CONTEXT_PARAM.bankJourneyID,
    },
    requestString: {
      salutation: d.salutation || '',
      firstName: d.first_name_pan || d.customerFirstName || '',
      middleName: d.middle_name_pan || d.customerMiddleName || '',
      lastName: d.last_name_pan || d.customerLastName || '',
      dob: d.customerDob || '',
      gender: d.gender || d.customerGender || '',
      employmentType: d.employmentType || '',
      gstnID: d.gstnID || '',
      resiAddressLine1: d.customerAddress1 || '',
      resiAddressLine2: d.customerAddress2 || '',
      resiAddressLine3: d.customerAddress3 || '',
      resiAddressCity: d.customerCity || '',
      resiAddressState: d.customerState || '',
      resiPincode: d.zipCode || '',
      accountNumber: d.accountNumber || '',
      customerID: d.customerID || '',
      assistedJourney: '',
      channel: '',
      branchCode: '',
      agentCode: '',
      smCode: '',
      seCode: '',
      lgCode: '',
      lcCode: '',
      crmPromoCode: '',
      fillerFields: {
        filler1: d.pan_number || d.panNo || '',
        filler2: d.selected_bank || '',
        filler3: d.income_verify_method || '',
      },
    },
  };
  trackEvent('bureau_offer_requested');
  jsonPost('/getBureauOffer', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        // responseString may come back as a JSON string in some environments
        const offer = typeof data.responseString === 'string'
          ? JSON.parse(data.responseString)
          : data.responseString;
        const offerAmountNum = parseFloat(offer.offerAmount) || 0;
        const tenureNum = parseInt(offer.tenure, 10) || 36;
        // Store only fields that exist on earlier panels — offer panel fields are
        // populated by initOfferPanel on the panel's own Initialize event, because
        // importData for unrendered fields is silently dropped by AEM Forms.
        globals.functions.importData({
          offerAmount: offerAmountNum,
          offerType: offer.offerType || '',
          tenure: tenureNum,
          rateOfInterest: offer.rateOfInterest || '',
          kycFlag: offer.kycFlag || '',
          apiError: '',
        });
        trackEvent('bureau_offer_received', { offerType: offer.offerType });
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.importData({ apiError: data.status.errorDesc });
        trackEvent('bureau_offer_failed', { errorCode: data.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Unable to fetch offer. Please try again.';
      globals.functions.importData({ apiError: msg });
      trackEvent('bureau_offer_error');
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

// ---- Tier 2: Email OTP ---------------------------------------------------

/**
 * Generates an OTP to the customer's email — bind on Send Email OTP button Click
 * @name generateEmailOTP Sends OTP to customer email for verification
 * @param {scope} globals
 */
function generateEmailOTP(globals) {
  const d = globals.functions.exportData();
  const emailAddress = d.emailAddress || '';
  if (!emailAddress) return '';
  const payload = {
    contextParam: {
      ...CONTEXT_PARAM,
      bankJourneyID: d.bankJourneyID || CONTEXT_PARAM.bankJourneyID,
    },
    requestString: { emailAddress, mobileNo: d.mobileNo || '', fillerFields: {} },
  };
  trackEvent('email_otp_initiated');
  jsonPost('/generateEmailOTP', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        globals.functions.importData({ emailOtpSent: true, emailOtpError: '' });
        trackEvent('email_otp_sent');
      } else {
        globals.functions.importData({ emailOtpSent: false, emailOtpError: data.status.errorDesc });
        trackEvent('email_otp_send_failed', { errorCode: data.status.errorCode });
      }
    })
    .catch(() => {
      globals.functions.importData({ emailOtpError: 'Unable to send email OTP. Please try again.' });
      trackEvent('email_otp_send_error');
    });
  return '';
}

/**
 * Validates email OTP entered by the customer
 * @name validateEmailOTP Validates email OTP and proceeds to the next step
 * @param {string} emailOtp OTP code received on customer email
 * @param {scope} globals
 */
function validateEmailOTP(emailOtp, globals) {
  if (!emailOtp) return '';
  const d = globals.functions.exportData();
  const payload = {
    contextParam: {
      ...CONTEXT_PARAM,
      bankJourneyID: d.bankJourneyID || CONTEXT_PARAM.bankJourneyID,
    },
    requestString: { emailOTP: emailOtp, mobileNo: d.mobileNo || '', fillerFields: {} },
  };
  jsonPost('/validateEmailOTP', payload)
    .then((data) => {
      if (data?.status?.responseCode === '0') {
        globals.functions.importData({ emailVerified: true, emailOtpError: '' });
        trackEvent('email_otp_success');
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.importData({
          emailVerified: false,
          emailOtpError: data.status.errorDesc,
        });
        trackEvent('email_otp_failed', { errorCode: data.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: data.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Email OTP validation failed. Please try again.';
      globals.functions.importData({ emailOtpError: msg });
      trackEvent('email_otp_error');
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

// ---- Final submission ----------------------------------------------------

/**
 * Submits the final loan application — bind on Preview step Confirm button Click
 * @name submitLoanApplication Submits loan application and stores acknowledgement ID
 * @param {scope} globals
 */
function submitLoanApplication(globals) {
  const data = globals.functions.exportData();
  const payload = {
    contextParam: { ...CONTEXT_PARAM },
    requestString: {
      loanAmount: data.loan_amount_slider_value || '',
      tenure: data.loan_tenure_slider_value || data.tenure || '',
      rateofInterest: data.rateOfInterest || '',
      emi: data.emi_amount || '',
      processingfees: data.processingFees || '',
      product: 'PL',
      consentToCALL: data.consentToCALL || 'Y',
      monthlyTakeHomeSalary: data.monthlyIncome || '',
      employerName: data.employerName || '',
      vkycConsent: 'Y',
      fillerFields: {},
    },
  };
  trackEvent('application_submitted', {
    tenure: data.loan_tenure_slider_value,
  });
  jsonPost('/submitLoanApplication', payload)
    .then((result) => {
      if (result?.status?.responseCode === '0') {
        const { acknowledgementId, vkycLink } = result.responseString;
        globals.functions.importData({ acknowledgementId, vkycLink: vkycLink || '', apiError: '' });
        trackEvent('application_success');
        document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
      } else {
        globals.functions.importData({ apiError: result.status.errorDesc });
        trackEvent('application_failed', { errorCode: result.status.errorCode });
        document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: result.status.errorDesc } }));
      }
    })
    .catch(() => {
      const msg = 'Loan submission failed. Please try again.';
      globals.functions.importData({ apiError: msg });
      trackEvent('application_error');
      document.dispatchEvent(new CustomEvent('loan-wizard:cancel', { detail: { error: msg } }));
    });
  return '';
}

// ---- Navigation ----------------------------------------------------------

/**
 * Advances the loan wizard to the next step without an API call.
 * Bind on Click for steps that require no server validation.
 * @name proceedToNextStep Navigates to the next wizard step
 */
function proceedToNextStep() {
  document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
  return '';
}

/**
 * Navigates the loan wizard back to the previous step.
 * @name goToPrevStep Navigate to the previous wizard step
 */
function goToPrevStep() {
  document.dispatchEvent(new CustomEvent('loan-wizard:back'));
  return '';
}

/**
 * Jumps to a specific loan wizard step by zero-based index.
 * @name goToStep Navigate to a specific wizard step
 * @param {number} stepIndex Zero-based step index (0 = first step)
 */
function goToStep(stepIndex) {
  document.dispatchEvent(new CustomEvent('loan-wizard:goto', { detail: { stepIndex } }));
  return '';
}

/**
 * Initialises the offer panel fields — bind on Initialize of the offer fragment/panel.
 * importData for offer panel fields CANNOT be called before the panel renders because
 * AEM Forms only registers fields in the model once their DOM exists. This function
 * runs after the panel is in the DOM, reads the stored API values (offerAmount, tenure,
 * rateOfInterest) and populates all display fields and sliders.
 * @name initOfferPanel Populates offer panel display fields and sets sliders on load
 * @param {scope} globals
 * @return {string}
 */
function initOfferPanel(globals) {
  const fd = globals.functions.exportData();
  const offerAmountNum = parseFloat(fd.offerAmount) || 0;
  const tenureNum = parseInt(fd.tenure, 10) || 36;
  const rateNum = parseFloat(fd.rateOfInterest) || 0;
  if (!offerAmountNum) return '';
  const pf = calculateProcessingFee(offerAmountNum);
  const formattedAmount = `₹${offerAmountNum.toLocaleString('en-IN')}`;
  globals.functions.importData({
    loan_amount_slider_value: offerAmountNum,
    loan_tenure_slider_value: tenureNum,
    emi_amount: calculateEMI(offerAmountNum, rateNum, tenureNum),
    processingFees: pf,
    taxes: calculateTaxes(pf),
    summary_amount: formattedAmount,
    offer_banner_text: `You can get a loan up to ${formattedAmount}!`,
    loan_tenure_display: `${tenureNum} months`,
  });
  setTimeout(() => {
    setSlider('loan_amount_slider_value', 50000, offerAmountNum, offerAmountNum);
    setSlider('loan_tenure_slider_value', 12, tenureNum, tenureNum);
  }, 200);
  return '';
}

/**
 * Recalculates EMI when either slider changes. Bind on is-changed of both sliders
 * and pass both field values as Rule Editor parameters — this avoids exportData()
 * reads inside the change cycle where the snapshot can lag (e.g. loan_tenure_slider_value
 * returns 0 if the tenure slider was never user-committed in this session).
 * Rule Editor binding (both sliders, same args):
 *   is changed → recalculateEMI(loan_amount_slider_value, loan_tenure_slider_value, globals)
 * @name recalculateEMI Recalculates EMI from current slider values
 * @param {number} loanAmount Bind to loan_amount_slider_value in Rule Editor
 * @param {number} tenureMonths Bind to loan_tenure_slider_value in Rule Editor
 * @param {scope} globals
 * @return {number} Updated EMI amount
 */
function recalculateEMI(loanAmount, tenureMonths, globals) {
  const principal = parseFloat(loanAmount) || 0;
  const fd = globals.functions.exportData();
  // tenureMonths may be 0 if the user never moved the tenure slider;
  // fall back to the tenure field set by the bureau offer API
  const tenure = parseInt(tenureMonths, 10) || parseInt(fd.tenure, 10) || 0;
  const rate = parseFloat(fd.rateOfInterest) || 0;
  if (!principal || !tenure) return 0;
  const emi = calculateEMI(principal, rate, tenure);
  const pf = calculateProcessingFee(principal);
  const formattedAmount = `₹${principal.toLocaleString('en-IN')}`;
  // DOM-only updates: importData triggers a full panel re-render that snaps sliders
  // back to authored defaults. Directly setting input.value skips the model update
  // and avoids the re-render entirely. finalizeAndProceedToPreview persists to model.
  [
    ['emi_amount', emi],
    ['processingFees', pf],
    ['taxes', calculateTaxes(pf)],
    ['summary_amount', formattedAmount],
    ['offer_banner_text', `You can get a loan up to ${formattedAmount}!`],
    ['loan_tenure_display', `${tenure} months`],
  ].forEach(([name, val]) => {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.value = String(val);
  });
  trackEvent('emi_recalculated', { principal, tenure });
  return emi;
}

/**
 * Persists the user's final loan choices to the form model, then advances to preview.
 * Bind on the offer panel "Next" button Click instead of proceedToNextStep.
 * recalculateEMI only updates the DOM to avoid re-renders; this function is the single
 * point where offer choices are written to the model for the preview and submission steps.
 * @name finalizeAndProceedToPreview Saves offer choices to model and navigates to preview
 * @param {scope} globals
 * @return {string}
 */
function finalizeAndProceedToPreview(globals) {
  const data = globals.functions.exportData();
  const principal = parseFloat(data.loan_amount_slider_value) || 0;
  const rate = parseFloat(data.rateOfInterest) || 0;
  const tenure = parseInt(data.loan_tenure_slider_value, 10)
    || parseInt(data.tenure, 10) || 0;
  if (!principal || !tenure) return '';
  const pf = calculateProcessingFee(principal);
  const formattedAmount = `₹${principal.toLocaleString('en-IN')}`;
  globals.functions.importData({
    loan_amount_slider_value: principal,
    loan_tenure_slider_value: tenure,
    emi_amount: calculateEMI(principal, rate, tenure),
    processingFees: pf,
    taxes: calculateTaxes(pf),
    summary_amount: formattedAmount,
    offer_banner_text: `You can get a loan up to ${formattedAmount}!`,
    loan_tenure_display: `${tenure} months`,
  });
  document.dispatchEvent(new CustomEvent('loan-wizard:proceed'));
  return '';
}

/**
 * Initialises preview panel display fields — bind on Initialize of the preview fragment.
 * Fields like processingFees and taxes only exist on the preview screen, so they cannot
 * be set by importData while the offer panel is active. This function reads the final
 * loan choices from the model (stored by finalizeAndProceedToPreview) and populates all
 * preview-only derived fields.
 * @name initPreviewPanel Populates preview panel derived fields on load
 * @param {scope} globals
 * @return {string}
 */
function initPreviewPanel(globals) {
  const data = globals.functions.exportData();
  const principal = parseFloat(data.loan_amount_slider_value) || 0;
  const rate = parseFloat(data.rateOfInterest) || 0;
  const tenure = parseInt(data.loan_tenure_slider_value, 10)
    || parseInt(data.tenure, 10) || 0;
  if (!principal || !tenure) return '';
  const pf = calculateProcessingFee(principal);
  const formattedAmount = `₹${principal.toLocaleString('en-IN')}`;
  globals.functions.importData({
    processingFees: pf,
    taxes: calculateTaxes(pf),
    emi_amount: calculateEMI(principal, rate, tenure),
    summary_amount: formattedAmount,
    loan_tenure_display: `${tenure} months`,
  });
  return '';
}

/**
 * Starts a 30-second countdown timer on the OTP screen.
 * Bind on the Initialize event of the OTP fragment.
 * Updates otpTimerText each second; when expired sets canResendOtp true.
 * @name startOtpTimer Starts OTP resend countdown timer
 * @param {scope} globals
 */
function startOtpTimer(globals) {
  let seconds = 30;
  const tick = () => {
    if (seconds > 0) {
      globals.functions.importData({
        otpTimerText: `Resend OTP in: ${seconds}s`,
        canResendOtp: false,
      });
      seconds -= 1;
      setTimeout(tick, 1000);
    } else {
      globals.functions.importData({ otpTimerText: '', canResendOtp: true });
    }
  };
  tick();
  return '';
}

// eslint-disable-next-line import/prefer-default-export
export {
  getFullName,
  getFormattedDob,
  days,
  submitFormArrayToString,
  maskMobileNumber,
  initiateCustomerIdentification,
  verifyOTPAndGetDemogDetails,
  panEnquiry,
  getBureauOfferAndProceed,
  generateEmailOTP,
  validateEmailOTP,
  calculateEMI,
  submitLoanApplication,
  proceedToNextStep,
  goToPrevStep,
  goToStep,
  initOfferPanel,
  recalculateEMI,
  finalizeAndProceedToPreview,
  initPreviewPanel,
  trackPageLoad,
  startOtpTimer,
};
