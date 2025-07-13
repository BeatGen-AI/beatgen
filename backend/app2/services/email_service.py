"""
Email service for sending transactional emails using Resend API
"""

import httpx
from typing import Dict, Optional
import traceback

from app2.core.config import settings
from app2.core.logging import get_logger
from app2.core.exceptions import ServiceException

logger = get_logger("beatgen.services.email")


class EmailService:
    """Service for sending emails via Resend API"""
    
    def __init__(self):
        self.api_key = settings.resend.API_KEY
        self.from_email = settings.resend.FROM_EMAIL
        self.from_name = settings.resend.FROM_NAME
        self.base_url = "https://api.resend.com"
        
        if not self.api_key:
            logger.warning("Resend API key not configured - email sending will fail")
    
    async def send_password_reset_email(
        self, 
        to_email: str, 
        reset_link: str
    ) -> bool:
        """
        Send password reset email
        
        Args:
            to_email: Recipient email address
            reset_link: Password reset link
            
        Returns:
            True if email was sent successfully
            
        Raises:
            ServiceException: If email sending fails
        """
        logger.info(f"Sending password reset email to: {to_email}")
        
        if not self.api_key:
            logger.error("Cannot send email - Resend API key not configured")
            raise ServiceException("Email service not configured")
        
        try:
            # Create email HTML content
            html_content = f"""
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }}
                    .container {{
                        background-color: #f7f7f7;
                        border-radius: 10px;
                        padding: 30px;
                        margin-top: 20px;
                    }}
                    .logo {{
                        text-align: center;
                        margin-bottom: 30px;
                    }}
                    .logo h1 {{
                        color: #5046e5;
                        font-size: 28px;
                        margin: 0;
                    }}
                    .content {{
                        background-color: white;
                        border-radius: 8px;
                        padding: 30px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }}
                    .button {{
                        display: inline-block;
                        background-color: #5046e5;
                        color: white;
                        text-decoration: none;
                        padding: 12px 30px;
                        border-radius: 6px;
                        font-weight: 600;
                        margin: 20px 0;
                    }}
                    .button:hover {{
                        background-color: #4338ca;
                    }}
                    .footer {{
                        margin-top: 30px;
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                    }}
                    .warning {{
                        background-color: #fef3c7;
                        border: 1px solid #f59e0b;
                        border-radius: 6px;
                        padding: 12px;
                        margin-top: 20px;
                        font-size: 14px;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="logo">
                        <h1>BeatGen</h1>
                    </div>
                    <div class="content">
                        <h2>Reset Your Password</h2>
                        <p>Hello,</p>
                        <p>We received a request to reset your password for your BeatGen account. Click the button below to create a new password:</p>
                        
                        <div style="text-align: center;">
                            <a href="{reset_link}" class="button">Reset Password</a>
                        </div>
                        
                        <p>If the button doesn't work, copy and paste this link into your browser:</p>
                        <p style="word-break: break-all; color: #5046e5; font-size: 12px;">{reset_link}</p>
                        
                        <div class="warning">
                            <strong>⚠️ Important:</strong> This link will expire in 1 hour for security reasons. If you didn't request this password reset, please ignore this email.
                        </div>
                    </div>
                    <div class="footer">
                        <p>© 2024 BeatGen, Inc. All rights reserved.</p>
                        <p>You received this email because a password reset was requested for your account.</p>
                        <p>If you did not request this, please ignore this email.</p>
                        <p style="margin-top: 10px; font-size: 12px; color: #999;">
                            BeatGen, Inc.<br>
                            Questions? Contact support@beatgen.com
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            # Plain text fallback
            text_content = f"""
Reset Your Password

Hello,

We received a request to reset your password for your BeatGen account.

Click the link below to create a new password:
{reset_link}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, please ignore this email.

© 2024 BeatGen. All rights reserved.
            """
            
            # Prepare email data
            email_data = {
                "from": f"{self.from_name} <{self.from_email}>",
                "to": [to_email],
                "subject": "Reset Your BeatGen Password",
                "html": html_content,
                "text": text_content,
                "headers": {
                    "X-Entity-Ref-ID": f"password-reset-{to_email}",
                    "List-Unsubscribe": f"<mailto:{self.from_email}?subject=Unsubscribe>",
                }
            }
            
            # Send email via Resend API
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/emails",
                    json=email_data,
                    headers=headers
                )
                
                if response.status_code == 200:
                    result = response.json()
                    logger.info(f"Password reset email sent successfully. Email ID: {result.get('id')}")
                    return True
                else:
                    error_msg = f"Failed to send email: {response.status_code} - {response.text}"
                    logger.error(error_msg)
                    raise ServiceException(error_msg)
                    
        except httpx.RequestError as e:
            logger.error(f"Request error sending email: {str(e)}")
            raise ServiceException(f"Failed to send email: {str(e)}")
        except Exception as e:
            logger.error(f"Error sending password reset email: {str(e)}")
            logger.error(traceback.format_exc())
            raise ServiceException(f"Failed to send password reset email: {str(e)}")