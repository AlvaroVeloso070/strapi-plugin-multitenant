import React from 'react';
import {
  Button,
  Flex,
  Grid,
  TextInput,
  Field,
} from '@strapi/design-system';
import { Check, ArrowLeft } from '@strapi/icons';
import {
  Page,
  useNotification,
  useFetchClient,
  Layouts,
} from '@strapi/strapi/admin';
import { Formik, Form } from 'formik';
import { useIntl } from 'react-intl';
import { useMutation, useQuery } from 'react-query';
import { useNavigate, useParams } from 'react-router-dom';

import pluginId from '../../pluginId';
import { getTenantUrl } from '../../utils/api';

const validate = (values) => {
  const errors = {};
  if (!values.name) errors.name = 'Required';
  return errors;
};

const TenantEditPage = () => {
  const { slug } = useParams();
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const navigate = useNavigate();
  const { get, put } = useFetchClient();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['multitenancy', 'tenant', slug],
    queryFn: async () => {
      const { data } = await get(getTenantUrl(slug));
      return data?.data;
    },
    enabled: !!slug,
  });

  const mutation = useMutation({
    mutationFn: (body) => put(getTenantUrl(slug), body),
    onSuccess: () => {
      toggleNotification({
        type: 'success',
        message: formatMessage({
          id: `${pluginId}.tenant.updated`,
          defaultMessage: 'Tenant updated successfully',
        }),
      });
      navigate('..');
    },
    onError: (err) => {
      const msg = err?.response?.data?.error?.message ?? err?.message;
      toggleNotification({
        type: 'danger',
        message: msg || formatMessage({
          id: `${pluginId}.error`,
          defaultMessage: 'Error updating tenant',
        }),
      });
    },
  });

  if (isLoading || !tenant) {
    return <Page.Loading />;
  }

  return (
    <Page.Main>
      <Page.Title>
        {formatMessage(
          { id: 'Settings.PageTitle', defaultMessage: 'Settings - {name}' },
          { name: tenant.name }
        )}
      </Page.Title>
      <Formik
        initialValues={{ name: tenant.name }}
        validate={validate}
        onSubmit={(values) => mutation.mutate(values)}
        enableReinitialize
      >
        {({ handleSubmit, values, handleChange, errors }) => (
          <Form noValidate onSubmit={handleSubmit}>
            <Layouts.Header
              primaryAction={
                <Button
                  type="submit"
                  loading={mutation.isLoading}
                  startIcon={<Check />}
                >
                  {formatMessage({ id: 'global.save', defaultMessage: 'Save' })}
                </Button>
              }
              title={formatMessage({
                id: `${pluginId}.edit.title`,
                defaultMessage: 'Edit tenant',
              })}
              subtitle={formatMessage(
                { id: `${pluginId}.edit.subtitle`, defaultMessage: 'Slug: {slug}' },
                { slug: tenant.slug }
              )}
              navigationAction={
                <Button variant="tertiary" onClick={() => navigate('..')} startIcon={<ArrowLeft />} size="S">
                  {formatMessage({ id: 'global.back', defaultMessage: 'Back' })}
                </Button>
              }
            />
            <Layouts.Content>
              <Flex
                background="neutral0"
                direction="column"
                alignItems="stretch"
                gap={7}
                hasRadius
                paddingTop={6}
                paddingBottom={6}
                paddingLeft={7}
                paddingRight={7}
                shadow="filterShadow"
              >
                <Grid.Root gap={4}>
                  <Grid.Item col={6} xs={12}>
                    <Field.Root name="slug">
                      <Field.Label>
                        {formatMessage({ id: 'global.slug', defaultMessage: 'Slug' })}
                      </Field.Label>
                      <TextInput
                        name="slug"
                        value={tenant.slug}
                        disabled
                      />
                      <Field.Hint>
                        {formatMessage({
                          id: `${pluginId}.slug.readonly`,
                          defaultMessage: 'Slug cannot be changed after creation',
                        })}
                      </Field.Hint>
                    </Field.Root>
                  </Grid.Item>
                  <Grid.Item col={6} xs={12}>
                    <Field.Root
                      name="name"
                      error={errors.name}
                      required
                    >
                      <Field.Label>
                        {formatMessage({ id: 'global.name', defaultMessage: 'Name' })}
                      </Field.Label>
                      <TextInput
                        name="name"
                        value={values.name || ''}
                        onChange={handleChange}
                      />
                      <Field.Error />
                    </Field.Root>
                  </Grid.Item>
                </Grid.Root>
              </Flex>
            </Layouts.Content>
          </Form>
        )}
      </Formik>
    </Page.Main>
  );
};

export default TenantEditPage;
