package com.freereport.security;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.SecretKey;
import java.util.Base64;
import java.util.Date;

@Component
public class JwtTokenProvider {
    private final SecretKey key;
    private final long expiration;
    private final long renewalThreshold;
    private final JwtParser jwtParser;

    public JwtTokenProvider(@Value("${jwt.secret}") String secret,
                           @Value("${jwt.expiration}") long expiration,
                           @Value("${jwt.renewal-threshold:1800000}") long renewalThreshold) {
        byte[] decoded = Base64.getDecoder().decode(secret);
        this.key = Keys.hmacShaKeyFor(decoded);
        this.expiration = expiration;
        this.renewalThreshold = renewalThreshold;
        this.jwtParser = Jwts.parser().verifyWith(key).build();
    }

    public String generateToken(AuthUser user) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("id", user.getId())
                .claim("username", user.getUsername())
                .claim("displayName", user.getDisplayName())
                .claim("companyId", user.getCompanyId())
                .claim("companyName", user.getCompanyName())
                .claim("companyCode", user.getCompanyCode())
                .claim("companyLevel", user.getCompanyLevel())
                .claim("role", user.getRole())
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }

    public AuthUser getAuthUserFromToken(String token) {
        Claims claims = jwtParser.parseSignedClaims(token).getPayload();
        return new AuthUser(
                claims.get("id", Long.class),
                claims.get("username", String.class),
                claims.get("displayName", String.class),
                claims.get("companyId", Long.class),
                claims.get("companyName", String.class),
                claims.get("companyCode", String.class),
                claims.get("companyLevel", String.class),
                claims.get("role", String.class)
        );
    }

    public boolean validateToken(String token) {
        try {
            jwtParser.parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 滑动过期判断：token 剩余有效期低于续签阈值时需要续签。
     * 调用前须已通过 validateToken（此处直接解析，不再容错）。
     */
    public boolean needsRenewal(String token) {
        Claims claims = jwtParser.parseSignedClaims(token).getPayload();
        long remaining = claims.getExpiration().getTime() - System.currentTimeMillis();
        return remaining < renewalThreshold;
    }
}
