package edu.sharespace;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication @ConfigurationPropertiesScan
public class ShareSpaceApplication { public static void main(String[] args){ SpringApplication.run(ShareSpaceApplication.class,args); } }
