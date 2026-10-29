package edu.sharespace;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;

@Configuration
@ConditionalOnExpression("!'${app.firebase.project-id:}'.isEmpty()")
class FirebaseAuthConfig {
    private static final Logger log = LoggerFactory.getLogger(FirebaseAuthConfig.class);

    @Bean
    FirebaseApp firebaseApp(@Value("${app.firebase.project-id}") String projectId) throws IOException {
        GoogleCredentials credentials;
        try {
            credentials = GoogleCredentials.getApplicationDefault();
        } catch (IOException ex) {
            log.error("Firebase Admin could not load Google Application Default Credentials (exceptionType={})",
                    ex.getClass().getSimpleName());
            throw ex;
        }
        log.info("Firebase Admin initialized with Application Default Credentials (credentialProvider={})",
                credentials.getClass().getSimpleName());
        return FirebaseApp.initializeApp(FirebaseOptions.builder()
                .setCredentials(credentials)
                .setProjectId(projectId)
                .build(), "sharespace");
    }

    @Bean
    FirebaseAuth firebaseAuth(FirebaseApp firebaseApp) {
        return FirebaseAuth.getInstance(firebaseApp);
    }
}
